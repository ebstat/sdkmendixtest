import express from 'express';
import { domainmodels, microflows } from "mendixmodelsdk";
import { MendixPlatformClient } from "mendixplatformsdk";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Mendix API is running' });
});

// Get entities for a given app
app.get('/apps/:appId/entities', async (req, res) => {
  try {
    const { appId } = req.params;
    const { moduleName = 'MyFirstModule' } = req.query;

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(appId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    const domainModelInterface = model
      .allDomainModels()
      .filter((dm) => dm.containerAsModule.name === moduleName)[0];

    if (!domainModelInterface) {
      return res.status(404).json({ 
        error: `Module '${moduleName}' not found` 
      });
    }

    const domainModel = await domainModelInterface.load();
    
    const entities = domainModel.entities.map(entity => ({
      id: entity.id,
      name: entity.name,
      qualifiedName: entity.qualifiedName,
      attributes: entity.attributes.map(attr => ({
        name: attr.name,
        type: attr.type?.constructor.name || 'Unknown'
      }))
    }));

    res.json({
      appId,
      moduleName,
      entities,
      count: entities.length
    });

  } catch (error: any) {
    console.error('Error fetching entities:', error);
    res.status(500).json({ 
      error: 'Failed to fetch entities', 
      message: error.message 
    });
  }
});

// Get microflows for a given app
app.get('/apps/:appId/microflows', async (req, res) => {
  try {
    const { appId } = req.params;
    const { moduleName = 'MyFirstModule' } = req.query;

    const client = new MendixPlatformClient();
    const mendixApp = client.getApp(appId);
    
    const workingCopy = await mendixApp.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    const allMicroflows = model.allMicroflows();
    const moduleMicroflows = allMicroflows.filter(
      mf => mf.containerAsModule.name === moduleName
    );

    const microflowDetails = await Promise.all(
      moduleMicroflows.map(async (mfInterface) => {
        const microflow = await mfInterface.load();
        return {
          id: microflow.id,
          name: microflow.name,
          qualifiedName: microflow.qualifiedName,
          returnType: microflow.microflowReturnType?.constructor.name || 'Void'
        };
      })
    );

    res.json({
      appId,
      moduleName,
      microflows: microflowDetails,
      count: microflowDetails.length
    });

  } catch (error: any) {
    console.error('Error fetching microflows:', error);
    res.status(500).json({ 
      error: 'Failed to fetch microflows', 
      message: error.message 
    });
  }
});

// Create new entity (your original functionality)
app.post('/apps/:appId/entities', async (req, res) => {
  try {
    const { appId } = req.params;
    const { entityName, moduleName = 'MyFirstModule' } = req.body;

    if (!entityName) {
      return res.status(400).json({ error: 'entityName is required' });
    }

    const client = new MendixPlatformClient();
    const app = client.getApp(appId);
    
    const workingCopy = await app.createTemporaryWorkingCopy("main");
    const model = await workingCopy.openModel();

    const domainModelInterface = model
      .allDomainModels()
      .filter((dm) => dm.containerAsModule.name === moduleName)[0];

    if (!domainModelInterface) {
      await workingCopy.delete();
      return res.status(404).json({ 
        error: `Module '${moduleName}' not found` 
      });
    }

    const domainModel = await domainModelInterface.load();
    const entity = domainmodels.Entity.createIn(domainModel);
    entity.name = entityName || `NewEntity_${Date.now()}`;

    await model.flushChanges();
    await workingCopy.commitToRepository("main");

    res.json({
      success: true,
      message: `Entity '${entity.name}' created successfully`,
      entityId: entity.id,
      entityName: entity.name
    });

  } catch (error) {
    console.error('Error creating entity:', error);
    res.status(500).json({ 
      error: 'Failed to create entity', 
      message: error.message 
    });
  }
});

// Start server
app.listen(PORT, () => {
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
