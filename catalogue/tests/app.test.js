const request = require('supertest');
const { MongoClient } = require('mongodb');
const CatalogueServiceApp = require('../src/app');

describe('Catalogue Service Functional Tests', () => {
  let app;
  let mockCollections;

  beforeAll(() => {
    const products = [
      { sku: 'sku1', name: 'Product1', categories: ['cat1'] },
      { sku: 'sku2', name: 'Product2', categories: ['cat2'] }
    ];

    const mockProductsCollection = {
      find: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue(products),
        sort: jest.fn().mockReturnThis()
      })),
      findOne: jest.fn(({ sku }) => {
        const product = products.find(p => p.sku === sku);
        return Promise.resolve(product || null);
      }),
      distinct: jest.fn().mockResolvedValue(['cat1', 'cat2'])
    };

    mockCollections = {
      products: mockProductsCollection
    };

    // Instantiate app with mock collections
    const service = new CatalogueServiceApp({
      mockCollections
    });
    app = service.getApp();
  });

  test('GET /health should return status 200 and app status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('app', 'OK');
    expect(res.body).toHaveProperty('mongo', true);
  });

  test('GET /products should return all products', async () => {
    const res = await request(app).get('/products');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toHaveProperty('sku', 'sku1');
  });

  test('GET /product/:sku should return specific product', async () => {
    const res = await request(app).get('/product/sku1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Product1');
  });

  test('GET /product/:sku returns 404 for non-existent SKU', async () => {
    const res = await request(app).get('/product/nonexistent');
    expect(res.status).toBe(404);
  });

  test('GET /products/:cat should return products in category', async () => {
    const res = await request(app).get('/products/cat1');
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty('categories');
    expect(res.body[0].categories).toContain('cat1');
  });

  test('GET /categories should return distinct categories', async () => {
    const res = await request(app).get('/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining(['cat1', 'cat2']));
  });

  test('GET /search/:text should search products', async () => {
    mockCollections.products.find = jest.fn(() => ({
      toArray: jest.fn().mockResolvedValue([mockCollections.products[0]])
    }));

    const res = await request(app).get('/search/Product1');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});
