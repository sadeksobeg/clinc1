// Target must match the API (see src/ClinicSaaS.Api/Properties/launchSettings.json).
// Override when your API runs on another port, e.g. PowerShell:
//   $env:API_PROXY_TARGET='http://localhost:7297'; npm start
const target = process.env.API_PROXY_TARGET || 'http://localhost:5137';

module.exports = {
  '/api': {
    target,
    secure: false,
    changeOrigin: true,
  },
};
