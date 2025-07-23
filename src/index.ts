import express from 'express';
import { domainmodels } from "mendixmodelsdk";
import { MendixPlatformClient } from "mendixplatformsdk";

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OKe', 
    message: 'Mendix API is running',
    hasToken: !!process.env.MENDIX_TOKEN,
    nodeEnv: process.env.NODE_ENV
  });
});

// Helper function to safely get module name from a microflow
function getModuleName(microflow: any): string | null {
  try {
    // Try to get the module directly
    if (microflow.containerAsModule) {
      return microflow.containerAsModule.name;
    }
    
    // If not directly in a module, traverse up the container hierarchy
    let container = microflow.container;
    while (container) {
      if (container.structureTypeName === 'Projects$Module') {
        return container.name;
      }
      container = container.container;
    }
    
    // Alternative approach: parse from qualified name
    if (microflow.qualifiedName) {
      const parts = microflow.qualifiedName.split('.');
      if (parts.length > 1) {
        return parts[0]; // First part is usually the module name
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`Could not get module name for microflow ${microflow.name}:`, error);
    return null;
  }
}

// Test endpoint that replicates your original working script
app.get('/test-original', async (req, res) => {
  try {
    console.log('Testing original logic...');
    console.log('MENDIX_TOKEN present:', !!process.env.MENDIX_TOKEN);
    
    const client = new MendixPlatformClient();
    console.log('Client created successfully');

    // Instead of creating a new app, let's try to get an existing one
    const app = client.getApp("snps-transitiegesprek"); // Replace with your actual app GUID
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

// Fixed microflows endpoint
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

    // Process microflows with safe module name extraction
    const microflowData = allMicroflows.map(mf => {
      const moduleName = getModuleName(mf);
      return {
        name: mf.name,
        module: moduleName,
        qualifiedName: mf.qualifiedName || `${moduleName || 'Unknown'}.${mf.name}`
      };
    });

    // Filter by module if specified
    let filteredMicroflows = microflowData;
    if (moduleName) {
      filteredMicroflows = microflowData.filter(
        mf => mf.module === moduleName
      );
      console.log(`Microflows in module '${moduleName}': ${filteredMicroflows.length}`);
    }

    // Group by module for better overview
    const microflowsByModule = filteredMicroflows.reduce((acc, mf) => {
      const module = mf.module || 'Unknown';
      if (!acc[module]) {
        acc[module] = [];
      }
      acc[module].push(mf);
      return acc;
    }, {} as Record<string, any[]>);

    console.log('Microflows grouped by module:', Object.keys(microflowsByModule).map(m => `${m}: ${microflowsByModule[m].length}`));

    res.json({
      appId,
      moduleName: moduleName || 'All modules',
      availableModules: allModules.map(m => m.name),
      microflows: filteredMicroflows,
      microflowsByModule,
      count: filteredMicroflows.length,
      totalCount: allMicroflows.length
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

// Additional endpoint to get microflows by specific module (alternative approach)
app.get('/apps/:appId/modules/:moduleName/microflows', async (req, res) => {
  try {
    const { appId, moduleName } = req.params;

    console.log(`Fetching microflows for app: ${appId}, module: ${moduleName}`);

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(appId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    // Find the specific module
    const targetModule = model.allModules().find(m => m.name === moduleName);
    if (!targetModule) {
      return res.status(404).json({
        error: 'Module not found',
        message: `Module '${moduleName}' does not exist`,
        availableModules: model.allModules().map(m => m.name)
      });
    }

    // Get all microflows from the model and filter by module
    const allMicroflows = model.allMicroflows();
    const microflowsInModule = allMicroflows.filter(mf => {
      const mfModuleName = getModuleName(mf);
      return mfModuleName === moduleName;
    });
    
    console.log(`Microflows found in module '${moduleName}': ${microflowsInModule.length}`);

    const microflowNames = microflowsInModule.map(mf => ({
      name: mf.name,
      module: moduleName,
      qualifiedName: mf.qualifiedName || `${moduleName}.${mf.name}`
    }));

    res.json({
      appId,
      moduleName,
      microflows: microflowNames,
      count: microflowNames.length
    });

  } catch (error: unknown) {
    console.error('Error fetching microflows for module:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to fetch microflows for module', 
      message: errorMessage,
      hasToken: !!process.env.MENDIX_TOKEN
    });
  }
});

// Get detailed information about a specific microflow
app.get('/apps/:appId/microflows/:microflowName', async (req, res) => {
  try {
    const { appId, microflowName } = req.params;
    const { moduleName } = req.query as { moduleName?: string };

    console.log(`Fetching details for microflow: ${microflowName} in app: ${appId}`);

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(appId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    // Find the specific microflow
    const allMicroflows = model.allMicroflows();
    let targetMicroflow = allMicroflows.find(mf => mf.name === microflowName);

    // If moduleName is provided, also check that it matches
    if (moduleName && targetMicroflow) {
      const mfModuleName = getModuleName(targetMicroflow);
      if (mfModuleName !== moduleName) {
        targetMicroflow = undefined;
      }
    }

    if (!targetMicroflow) {
      return res.status(404).json({
        error: 'Microflow not found',
        message: `Microflow '${microflowName}' ${moduleName ? `in module '${moduleName}' ` : ''}does not exist`,
        availableMicroflows: allMicroflows.slice(0, 10).map(mf => ({
          name: mf.name,
          module: getModuleName(mf)
        }))
      });
    }

    // Extract basic information that's available on IMicroflow
    const microflowModule = getModuleName(targetMicroflow);
    const details = {
      name: targetMicroflow.name,
      module: microflowModule,
      qualifiedName: targetMicroflow.qualifiedName || `${microflowModule || 'Unknown'}.${targetMicroflow.name}`,
      documentation: (targetMicroflow as any).documentation || '',
      
      // Basic properties available
      id: targetMicroflow.id,
      structureTypeName: targetMicroflow.structureTypeName,
      
      // Try to get additional properties if they exist
      returnType: (targetMicroflow as any).microflowReturnType?.toString() || 'Unknown',
      
      // Security settings (if available)
      allowedRoles: (targetMicroflow as any).allowedRoles?.map((role: any) => role.name) || [],
      allowConcurrentExecution: (targetMicroflow as any).allowConcurrentExecution || false,
      
      // Metadata (if available)
      markAsUsed: (targetMicroflow as any).markAsUsed || false,
      excluded: (targetMicroflow as any).excluded || false,
      
      // Note about limitations
      note: 'Limited details available - for full microflow structure, use Mendix Studio Pro or Model SDK with full model loading'
    };

    // Basic statistics
    const stats = {
      hasDocumentation: !!details.documentation,
      hasReturnType: details.returnType !== 'Unknown',
      hasAllowedRoles: details.allowedRoles.length > 0
    };

    res.json({
      appId,
      microflow: details,
      statistics: stats
    });

  } catch (error: unknown) {
    console.error('Error fetching microflow details:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to fetch microflow details', 
      message: errorMessage,
      hasToken: !!process.env.MENDIX_TOKEN
    });
  }
});

// Get detailed microflow structure (requires full model loading)
app.get('/apps/:appId/microflows/:microflowName/details', async (req, res) => {
  try {
    const { appId, microflowName } = req.params;
    const { moduleName } = req.query as { moduleName?: string };

    console.log(`Fetching detailed structure for microflow: ${microflowName}`);

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(appId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    // Find the microflow
    const allMicroflows = model.allMicroflows();
    let targetMicroflow = allMicroflows.find(mf => mf.name === microflowName);

    if (moduleName && targetMicroflow) {
      const mfModuleName = getModuleName(targetMicroflow);
      if (mfModuleName !== moduleName) {
        targetMicroflow = undefined;
      }
    }

    if (!targetMicroflow) {
      return res.status(404).json({
        error: 'Microflow not found',
        message: `Microflow '${microflowName}' ${moduleName ? `in module '${moduleName}' ` : ''}does not exist`
      });
    }

    // Load the full microflow model
await targetMicroflow.load();
await (targetMicroflow as any).objectCollection.load();

const objects = (targetMicroflow as any).objectCollection.objects;
const flows = (targetMicroflow as any).objectCollection.flows;

const actions = objects.map((obj: any) => ({
  id: obj.id,
  type: obj.structureTypeName,
  caption: obj.caption?.value || null,
  condition: obj.condition?.value || null,
  returnVariableName: obj.returnVariableName || null,
  // Add other props as needed
}));

const connections = flows.map((flow: any) => ({
  id: flow.id,
  source: flow.source?.id,
  target: flow.target?.id,
  isErrorHandler: flow.isErrorHandler
}));

res.json({
  appId,
  microflow: {
    name: targetMicroflow.name,
    qualifiedName: targetMicroflow.qualifiedName,
    actions,
    flows: connections
  }
});
  }catch (error: unknown) {
    console.error('Error fetching full microflow details:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to fetch full microflow structure', 
      message: errorMessage
    });
  }
});

// Get microflow details by qualified name (alternative endpoint)
app.get('/apps/:appId/microflows/by-qualified-name/:qualifiedName', async (req, res) => {
  try {
    const { appId, qualifiedName } = req.params;

    console.log(`Fetching microflow by qualified name: ${qualifiedName}`);

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(appId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    const allMicroflows = model.allMicroflows();
    const targetMicroflow = allMicroflows.find(mf => 
      mf.qualifiedName === qualifiedName ||
      `${getModuleName(mf)}.${mf.name}` === qualifiedName
    );

    if (!targetMicroflow) {
      return res.status(404).json({
        error: 'Microflow not found',
        message: `Microflow with qualified name '${qualifiedName}' does not exist`
      });
    }

    // Redirect to the standard microflow details endpoint
    const microflowModule = getModuleName(targetMicroflow);
    const redirectUrl = `/apps/${appId}/microflows/${targetMicroflow.name}${microflowModule ? `?moduleName=${microflowModule}` : ''}`;
    
    res.redirect(redirectUrl);

  } catch (error: unknown) {
    console.error('Error fetching microflow by qualified name:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to fetch microflow by qualified name', 
      message: errorMessage
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
