const express         = require('express');
const bodyParser      = require('body-parser');
const pino            = require('pino');
const expPino         = require('express-pino-logger');
const { MongoClient } = require('mongodb');

class CatalogueServiceApp {
  constructor(options = {}) {
    const {
      mongoHost,
      mockCollections
    } = options;

    this.mongoConnected   = false;
    this.mongoHost        = mongoHost;
    this.mongoUrl         = 'mongodb://' + this.mongoHost + ':27017/catalogue';

    /* -------------------------
       Logger
    --------------------------*/
    this.logger           = pino({ level: 'info', useLevelLabels: true });
    this.expLogger        = expPino({
      logger             : this.logger,
      autoLogging        : { ignorePaths: ['/health'] }
    });

    /* -------------------------
       Express
    --------------------------*/
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    /* -------------------------
       Mongo
    --------------------------*/
    if (!mockCollections) {
      this.startMongoLoop();
    } else {
      this.collection     = mockCollections.products;
      this.mongoConnected = true;
    }
  }

  /* -------------------------
     Logging helpers
  --------------------------*/
  logWarn(req, res, details) {
    req.log.warn({
      statusCode : res.statusCode,
      ...details
    });
  }

  logError(req, res, error, details = {}) {
    req.log.error({
      statusCode : res.statusCode,
      err        : error,
      ...details
    });
  }

  /* -------------------------
     Middleware
  --------------------------*/
  setupMiddleware() {
    this.app.use(this.expLogger);
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.app.use((req, res, next) => {
      res.set('Timing-Allow-Origin', '*');
      res.set('Access-Control-Allow-Origin', '*');
      next();
    });
  }

  /* -------------------------
     Routes
  --------------------------*/
  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({
        app   : 'OK',
        mongo : this.mongoConnected
      });
    });

    // all products
    this.app.get('/products', async (req, res) => {
      if (!this.mongoConnected) {
        res.status(500).send('database not available');
        this.logError(req, res, null, {
          error_type : 'DEPENDENCY_DOWN',
          dependency : 'mongodb'
        });
        return;
      }

      try {
        const products      = await this.collection.find({}).toArray();
        res.json(products);
      } catch (e) {
        res.status(500).send('internal error');
        this.logError(req, res, e, { error_type: 'FETCH_PRODUCTS_FAILED' });
      }
    });

    // product by SKU
    this.app.get('/product/:sku', async (req, res) => {
      if (!this.mongoConnected) {
        res.status(500).send('database not available');
        this.logError(req, res, null, {
          error_type : 'DEPENDENCY_DOWN',
          dependency : 'mongodb'
        });
        return;
      }

      try {
        const delay         = 0;
        setTimeout(async () => {
          const product     = await this.collection.findOne({ sku: req.params.sku });
          if (!product) {
            res.status(404).send('SKU not found');
            this.logWarn(req, res, {
              error_type : 'SKU_NOT_FOUND',
              sku        : req.params.sku
            });
            return;
          }
          res.json(product);
        }, delay);
      } catch (e) {
        res.status(500).send('internal error');
        this.logError(req, res, e, { error_type: 'FETCH_PRODUCT_FAILED' });
      }
    });

    // products by category
    this.app.get('/products/:cat', async (req, res) => {
      if (!this.mongoConnected) {
        res.status(500).send('database not available');
        this.logError(req, res, null, {
          error_type : 'DEPENDENCY_DOWN',
          dependency : 'mongodb'
        });
        return;
      }

      try {
        const products = await this.collection
          .find({ categories: req.params.cat })
          .sort({ name: 1 })
          .toArray();

        if (products.length === 0) {
          res.status(404).send(`No products for ${req.params.cat}`);
          this.logWarn(req, res, {
            error_type : 'CATEGORY_EMPTY',
            category   : req.params.cat
          });
          return;
        }

        res.json(products);
      } catch (e) {
        res.status(500).send('internal error');
        this.logError(req, res, e, { error_type: 'FETCH_CATEGORY_FAILED' });
      }
    });

    // all categories
    this.app.get('/categories', async (req, res) => {
      if (!this.mongoConnected) {
        res.status(500).send('database not available');
        this.logError(req, res, null, {
          error_type : 'DEPENDENCY_DOWN',
          dependency : 'mongodb'
        });
        return;
      }

      try {
        const categories = await this.collection.distinct('categories');
        res.json(categories);
      } catch (e) {
        res.status(500).send('internal error');
        this.logError(req, res, e, { error_type: 'FETCH_CATEGORIES_FAILED' });
      }
    });

    // search (no text)
    this.app.get('/search', async (req, res) => {
      if (!this.mongoConnected) {
        res.status(500).send('database not available');
        this.logError(req, res, null, {
          error_type : 'DEPENDENCY_DOWN',
          dependency : 'mongodb'
        });
        return;
      }

      try {
        const products = await this.collection.find({}).toArray();
        res.json(products);
      } catch (e) {
        res.status(500).send('internal error');
        this.logError(req, res, e, { error_type: 'SEARCH_FAILED' });
      }
    });

    // search text
    this.app.get('/search/:text', async (req, res) => {
      if (!this.mongoConnected) {
        res.status(500).send('database not available');
        this.logError(req, res, null, {
          error_type : 'DEPENDENCY_DOWN',
          dependency : 'mongodb'
        });
        return;
      }

      try {
        const hits = await this.collection
          .find({ $text: { $search: req.params.text } })
          .toArray();
        res.json(hits);
      } catch (e) {
        res.status(500).send('internal error');
        this.logError(req, res, e, { error_type: 'SEARCH_FAILED' });
      }
    });
  }

  /* -------------------------
     Mongo
  --------------------------*/
  async mongoConnect() {
    const client            = await MongoClient.connect(this.mongoUrl);
    this.db                 = client.db('catalogue');
    this.collection         = this.db.collection('products');
    this.mongoConnected     = true;
    this.logger.info('MongoDB connected');
  }

  startMongoLoop() {
    const tryConnect = async () => {
      try {
        await this.mongoConnect();
      } catch (e) {
        this.logger.error({ err: e }, 'MongoDB connection failed');
        setTimeout(tryConnect, 2000);
      }
    };
    tryConnect();
  }

  getApp() {
    return this.app;
  }
}

module.exports = CatalogueServiceApp;