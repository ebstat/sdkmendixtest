import express from 'express';
import { domainmodels } from "mendixmodelsdk";
import { MendixPlatformClient } from "mendixplatformsdk";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Mendix API is running',
    hasToken: !!process.env.MENDIX_TOKEN,
    nodeEnv: process.env.NODE_ENV
  });
});

// Test endpoint that replicates your original working script
app.get('/test-original', async (req, res) => {
  try {
    console.log('Testing original logic...');
    console.log('MENDIX_TOKEN present:', !!process.env.MENDIX_TOKEN);
    
    const client = new MendixPlatformClient();
    console.log('Client created successfully');

    // Instead of creating a new app, let's try to get an existing one
    const app = client.getApp("snps-transitiegesprek"); // Using your app ID
    console.log('App retrieved successfully');

    const workingCopy = await app.createTemporaryWorkingCopy("main");
    console.log('Working copy created successfully');

    const model = await workingCopy.openModel();
    console.log('Model opened successfully');

    // Try to get all modules first
    const allModules = model.allModules();
    console.log('Modules found:', allModules.map(m => m.name));

    res.json({
      success: true,
      message: 'Test completed successfully',
      modules: allModules.map(m => m.name),
      hasToken: !!process.env.MENDIX_TOKEN
    });

  } catch (error: unknown) {
    console.error('Test failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Test failed', 
      message: errorMessage,
      hasToken: !!process.env.MENDIX_TOKEN
    });
  }
});

// Simple microflows endpoint matching your request
app.get('/apps/:appId/microflows', async (req, res) => {
  try {
    const { appId } = req.params;
    const { moduleName } = req.query as { moduleName?: string };

    console.log(`Fetching microflows for app: ${appId}, module: ${moduleName}`);
    console.log('MENDIX_TOKEN present:', !!process.env.MENDIX_TOKEN);

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(appId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    // Get all modules first to debug
    const allModules = model.allModules();
    console.log('Available modules:', allModules.map(m => m.name));

    const allMicroflows = model.allMicroflows();
    console.log(`Total microflows found: ${allMicroflows.length}`);

    let filteredMicroflows = allMicroflows;
    if (moduleName) {
      filteredMicroflows = allMicroflows.filter(
        mf => mf.containerAsModule.name === moduleName
      );
      console.log(`Microflows in module '${moduleName}': ${filteredMicroflows.length}`);
    }

    const microflowNames = filteredMicroflows.map(mf => ({
      name: mf.name,
      module: mf.containerAsModule.name,
      qualifiedName: mf.qualifiedName
    }));

    res.json({
      appId,
      moduleName: moduleName || 'All modules',
      availableModules: allModules.map(m => m.name),
      microflows: microflowNames,
      count: microflowNames.length
    });

  } catch (error: unknown) {
    console.error('Error fetching microflows:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to fetch microflows', 
      message: errorMessage,
      hasToken: !!process.env.MENDIX_TOKEN
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
   console.log(`Mendix API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    // Verify MENDIX_TOKEN is available
  if (process.env.MENDIX_TOKEN) {
    console.log('✅ MENDIX_TOKEN found in environment');
  } else {
    console.warn('⚠️  MENDIX_TOKEN not found in environment variables');
  }
});

export default app;
