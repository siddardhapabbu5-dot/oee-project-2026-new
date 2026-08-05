export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Production Management System API',
    version: '1.0.0',
    description:
      'Enterprise MES/ERP REST API for production planning, shop-floor entry, OEE, downtime, changeovers, and reporting.',
  },
  servers: [{ url: 'http://localhost:4000', description: 'Local' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        security: [],
        summary: 'Health check',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/auth/login': {
      post: {
        security: [],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'JWT + user' } },
      },
    },
    '/api/auth/me': { get: { summary: 'Current user profile', responses: { 200: { description: 'Profile' } } } },
    '/api/dashboard/kpis': { get: { summary: 'Dashboard KPIs', responses: { 200: { description: 'KPI cards' } } } },
    '/api/dashboard/charts': { get: { summary: 'Dashboard charts', responses: { 200: { description: 'Chart series' } } } },
    '/api/plans': {
      get: { summary: 'List production plans', responses: { 200: { description: 'Paginated plans' } } },
      post: { summary: 'Create production plan', responses: { 201: { description: 'Created' } } },
    },
    '/api/production-entries': {
      post: { summary: 'Create hourly production entry', responses: { 201: { description: 'Created' } } },
    },
    '/api/downtime-entries': {
      post: { summary: 'Create downtime entry', responses: { 201: { description: 'Created' } } },
    },
    '/api/changeover-entries': {
      post: { summary: 'Create changeover entry', responses: { 201: { description: 'Created' } } },
    },
    '/api/reports/{type}': {
      get: {
        summary: 'Report data',
        parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Rows' } },
      },
    },
    '/api/reports/{type}/export/excel': {
      get: {
        summary: 'Export Excel',
        parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'XLSX file' } },
      },
    },
    '/api/reports/{type}/export/pdf': {
      get: {
        summary: 'Export PDF',
        parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'PDF file' } },
      },
    },
  },
};
