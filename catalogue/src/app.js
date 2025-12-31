const express = require('express');
const bodyParser = require('body-parser');
const pino = require('pino');
const expPino = require('express-pino-logger');
const { MongoClient } = require('mongodb');

class CatalogueServiceApp {
  constructor(options = {}) {
    const { mongoHost, mockCollections} = options;

    this.mongoConnected = false;
    this.mongoHost = mongoHost;
    this.mongoUrl = 'mongodb://' + this.mongoHost + ':27017/catalogue';

    this.logger = pino({ level: 'info', prettyPrint: false, useLevelLabels: true });
    this.expLogger = expPino({
      logger: this.logger,
      autoLogging: {
        ignorePaths: ['/health']
      }
    });


    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    // Mock collections for unit testing
    if (!mockCollections) {
      this.startMongoLoop();
    } 
    else {
      this.collection = mockCollections.products;
      this.mongoConnected = true;
    }
  }

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

  setupRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({
        app: 'OK',
        mongo: this.mongoConnected
      });
    });

    // all products
    this.app.get('/products', async (req, res) => {
      if (!this.mongoConnected) return res.status(500).send('database not available');
      try {
        const products = await this.collection.find({}).toArray();
        res.json(products);
      } catch (e) {
        req.log.error('ERROR', e);
        res.status(500).send(e);
      }
    });

    // product by SKU
    this.app.get('/product/:sku', async (req, res) => {
      if (!this.mongoConnected) return res.status(500).send('database not available');
      try {
        const delay = 0;
        setTimeout(async () => {
          const product = await this.collection.findOne({ sku: req.params.sku });
          if (product) res.json(product);
          else res.status(404).send('SKU not found');
        }, delay);
      } catch (e) {
        req.log.error('ERROR', e);
        res.status(500).send(e);
      }
    });

    // products by category
    this.app.get('/products/:cat', async (req, res) => {
      if (!this.mongoConnected) return res.status(500).send('database not available');
      try {
        const products = await this.collection
          .find({ categories: req.params.cat })
          .sort({ name: 1 })
          .toArray();
        if (products.length > 0) res.json(products);
        else res.status(404).send(`No products for ${req.params.cat}`);
      } catch (e) {
        req.log.error('ERROR', e);
        res.status(500).send(e);
      }
    });

    // all categories
    this.app.get('/categories', async (req, res) => {
      if (!this.mongoConnected) return res.status(500).send('database not available');
      try {
        const categories = await this.collection.distinct('categories');
        res.json(categories);
      } catch (e) {
        req.log.error('ERROR', e);
        res.status(500).send(e);
      }
    });

    // search with no text → return all products
    this.app.get('/search', async (req, res) => {
      if (!this.mongoConnected) return res.status(500).send('database not available');
      try {
        const products = await this.collection.find({}).toArray();
        res.json(products);
      } catch (e) {
        req.log.error('ERROR', e);
        res.status(500).send(e);
      }
    });

    // search text
    this.app.get('/search/:text', async (req, res) => {
      if (!this.mongoConnected) return res.status(500).send('database not available');
      try {
        const hits = await this.collection
          .find({ $text: { $search: req.params.text } })
          .toArray();
        res.json(hits);
      } catch (e) {
        req.log.error('ERROR', e);
        res.status(500).send(e);
      }
    });
  }

  async mongoConnect() {
    const client = await MongoClient.connect(this.mongoUrl);
    this.db = client.db('catalogue');
    this.collection = this.db.collection('products');
    this.mongoConnected = true;
    this.logger.info('MongoDB connected');
  }

  startMongoLoop() {
    const tryConnect = async () => {
      try {
        await this.mongoConnect();
      } catch (e) {
        this.logger.error('ERROR', e);
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