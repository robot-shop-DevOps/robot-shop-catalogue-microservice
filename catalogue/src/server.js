const CatalogueServiceApp = require('./app');

const mongoHost = process.env.MONGO_HOST;
const port = process.env.USER_SERVER_PORT;

const service = new CatalogueServiceApp({ mongoHost });
const app = service.getApp();

app.listen(port, () => {
  console.info('Started on port', port);
});
