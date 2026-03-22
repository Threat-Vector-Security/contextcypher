/**
 * Cloud Discovery Routes
 * Handles cloud service discovery API endpoints for AWS, Azure, and GCP
 */

const express = require('express');
const router = express.Router();

// AWS SDK imports
const { ConfigServiceClient, SelectResourceConfigCommand } = require('@aws-sdk/client-config-service');
const { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand } = require('@aws-sdk/client-ec2');
const { RDSClient, DescribeDBInstancesCommand } = require('@aws-sdk/client-rds');

// Azure SDK imports
const { ResourceGraphClient } = require('@azure/arm-resourcegraph');
const { DefaultAzureCredential, ClientSecretCredential } = require('@azure/identity');

// GCP SDK imports
const { AssetServiceClient } = require('@google-cloud/asset');

/**
 * AWS Discovery Endpoint
 */
router.post('/discover-aws', async (req, res) => {
  try {
    const { credentials, resourceTypes, regions } = req.body;

    if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
      return res.status(400).json({
        success: false,
        error: 'AWS credentials required (accessKeyId, secretAccessKey)'
      });
    }

    const resources = [];
    const errors = [];

    // Initialize AWS Config client
    const configClient = new ConfigServiceClient({
      region: credentials.region || 'us-east-1',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey
      }
    });

    // Discover resources using AWS Config
    const configQuery = `
      SELECT
        resourceId,
        resourceType,
        resourceName,
        awsRegion,
        configuration,
        tags
      WHERE resourceType IN (${resourceTypes.map(t => `'${t}'`).join(', ')})
    `;

    try {
      const command = new SelectResourceConfigCommand({
        Expression: configQuery,
        Limit: 100
      });

      const response = await configClient.send(command);

      if (response.Results) {
        for (const result of response.Results) {
          const resource = JSON.parse(result);
          resources.push({
            id: resource.resourceId,
            name: resource.resourceName || resource.resourceId,
            type: resource.resourceType,
            provider: 'aws',
            region: resource.awsRegion,
            tags: resource.tags || {},
            metadata: {
              configuration: resource.configuration,
              discoveredAt: new Date().toISOString()
            }
          });
        }
      }
    } catch (error) {
      errors.push(`AWS Config error: ${error.message}`);
      console.error('AWS Config discovery error:', error);
    }

    res.json({
      success: resources.length > 0,
      resources,
      errors: errors.length > 0 ? errors : undefined,
      totalCount: resources.length
    });

  } catch (error) {
    console.error('AWS discovery error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'AWS discovery failed'
    });
  }
});

/**
 * Azure Discovery Endpoint
 */
router.post('/discover-azure', async (req, res) => {
  try {
    const { credentials, query } = req.body;

    if (!credentials?.clientId || !credentials?.clientSecret ||
        !credentials?.tenantId || !credentials?.subscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'Azure credentials required (clientId, clientSecret, tenantId, subscriptionId)'
      });
    }

    const azureCredential = new ClientSecretCredential(
      credentials.tenantId,
      credentials.clientId,
      credentials.clientSecret
    );

    const resourceGraphClient = new ResourceGraphClient(azureCredential);

    const queryRequest = {
      query: query,
      subscriptions: [credentials.subscriptionId]
    };

    const response = await resourceGraphClient.resources(queryRequest);

    const resources = response.data.map(resource => ({
      id: resource.id,
      name: resource.name,
      type: resource.type,
      provider: 'azure',
      region: resource.location,
      tags: resource.tags || {},
      metadata: {
        resourceGroup: resource.resourceGroup,
        subscriptionId: resource.subscriptionId,
        properties: resource.properties,
        discoveredAt: new Date().toISOString()
      }
    }));

    res.json({
      success: true,
      resources,
      totalCount: resources.length
    });

  } catch (error) {
    console.error('Azure discovery error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Azure discovery failed'
    });
  }
});

/**
 * GCP Discovery Endpoint
 */
router.post('/discover-gcp', async (req, res) => {
  try {
    const { projectId, assetTypes, credentials } = req.body;

    if (!projectId || !credentials?.serviceAccountKey) {
      return res.status(400).json({
        success: false,
        error: 'GCP credentials required (projectId, serviceAccountKey)'
      });
    }

    // Parse service account key
    let serviceAccount;
    try {
      serviceAccount = typeof credentials.serviceAccountKey === 'string'
        ? JSON.parse(credentials.serviceAccountKey)
        : credentials.serviceAccountKey;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid service account key JSON'
      });
    }

    const assetClient = new AssetServiceClient({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key
      },
      projectId: serviceAccount.project_id
    });

    const parent = `projects/${projectId}`;

    const [assets] = await assetClient.listAssets({
      parent: parent,
      assetTypes: assetTypes,
      contentType: 'RESOURCE'
    });

    const resources = assets.map(asset => ({
      id: asset.name,
      name: asset.resource?.data?.name || asset.name?.split('/').pop() || 'Unknown',
      type: asset.assetType,
      provider: 'gcp',
      region: extractGCPLocation(asset),
      tags: asset.resource?.data?.labels || {},
      metadata: {
        parent: asset.resource?.parent,
        data: asset.resource?.data,
        discoveredAt: new Date().toISOString()
      }
    }));

    res.json({
      success: true,
      assets: resources,
      totalCount: resources.length
    });

  } catch (error) {
    console.error('GCP discovery error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'GCP discovery failed'
    });
  }
});

/**
 * Get available AWS regions
 */
router.post('/aws-regions', async (req, res) => {
  try {
    const ec2Client = new EC2Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: req.body.accessKeyId || '',
        secretAccessKey: req.body.secretAccessKey || ''
      }
    });

    const command = new DescribeRegionsCommand({});
    const response = await ec2Client.send(command);

    const regions = response.Regions?.map(r => ({
      name: r.RegionName,
      endpoint: r.Endpoint,
      optInStatus: r.OptInStatus
    })) || [];

    res.json({ regions });

  } catch (error) {
    console.error('AWS regions error:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch AWS regions'
    });
  }
});

/**
 * Test cloud credentials
 */
router.post('/test-credentials', async (req, res) => {
  try {
    const { provider, credentials } = req.body;

    let result = { valid: false, message: '' };

    switch (provider) {
      case 'aws': {
        const configClient = new ConfigServiceClient({
          region: credentials.region || 'us-east-1',
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey
          }
        });

        try {
          await configClient.send(new SelectResourceConfigCommand({
            Expression: 'SELECT resourceId WHERE resourceType = \'AWS::EC2::Instance\'',
            Limit: 1
          }));
          result = { valid: true, message: 'AWS credentials valid' };
        } catch (error) {
          result = { valid: false, message: `AWS validation failed: ${error.message}` };
        }
        break;
      }

      case 'azure': {
        const azureCredential = new ClientSecretCredential(
          credentials.tenantId,
          credentials.clientId,
          credentials.clientSecret
        );

        const resourceGraphClient = new ResourceGraphClient(azureCredential);

        try {
          await resourceGraphClient.resources({
            query: 'Resources | limit 1',
            subscriptions: [credentials.subscriptionId]
          });
          result = { valid: true, message: 'Azure credentials valid' };
        } catch (error) {
          result = { valid: false, message: `Azure validation failed: ${error.message}` };
        }
        break;
      }

      case 'gcp': {
        const serviceAccount = JSON.parse(credentials.serviceAccountKey);
        const assetClient = new AssetServiceClient({
          credentials: {
            client_email: serviceAccount.client_email,
            private_key: serviceAccount.private_key
          }
        });

        try {
          await assetClient.listAssets({
            parent: `projects/${credentials.projectId}`,
            pageSize: 1
          });
          result = { valid: true, message: 'GCP credentials valid' };
        } catch (error) {
          result = { valid: false, message: `GCP validation failed: ${error.message}` };
        }
        break;
      }

      default:
        result = { valid: false, message: 'Unsupported provider' };
    }

    res.json(result);

  } catch (error) {
    console.error('Credential validation error:', error);
    res.status(500).json({
      valid: false,
      message: error.message || 'Validation failed'
    });
  }
});

/**
 * Helper function to extract GCP location from asset
 */
function extractGCPLocation(asset) {
  const data = asset.resource?.data || {};

  if (data.zone) {
    const zone = data.zone.split('/').pop();
    return zone?.replace(/-[a-z]$/, '') || 'global';
  }

  if (data.region) {
    return data.region.split('/').pop() || 'global';
  }

  if (data.location) {
    return data.location;
  }

  const nameParts = (asset.name || '').split('/');
  for (const part of nameParts) {
    if (part.includes('zones') || part.includes('regions')) {
      const index = nameParts.indexOf(part);
      if (index < nameParts.length - 1) {
        return nameParts[index + 1];
      }
    }
  }

  return 'global';
}

module.exports = router;
