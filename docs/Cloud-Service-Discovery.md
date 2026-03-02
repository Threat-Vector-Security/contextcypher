# Cloud Service Discovery - Architecture & Implementation

> **Temporary Note (feature disabled)**  
> Cloud discovery endpoints and UI are currently hidden by default while we finish the surrounding access controls. To re-enable locally, set `REACT_APP_ENABLE_CLOUD_DISCOVERY=true` for the frontend and `ENABLE_CLOUD_DISCOVERY=true` for the backend before rebuilding/restarting both services. Remove these env vars (or set them to any other value) to keep discovery disabled.

## Overview

ContextCypher's Cloud Service Discovery feature enables automatic infrastructure mapping from AWS, Azure, and GCP cloud environments. It discovers cloud resources and generates accurate architecture diagrams using authentic vendor node types and icons.

## Key Features

- **Multi-Cloud Support**: AWS, Azure, and GCP discovery
- **Session-Only Credentials**: No storage, maximum security
- **Vendor Node Prioritization**: Always uses cloud-specific nodes before generic fallbacks
- **Merge & Replace Modes**: Add to existing diagram or start fresh
- **Automatic Relationship Detection**: Maps connections between resources
- **Security Zone Inference**: Intelligent zone assignment based on resource types
- **Real-Time Discovery**: Progress tracking with cancellation support
- **ID Collision Prevention**: Automatic prefixing prevents merge conflicts

## Architecture

### Component Structure

```
CloudServiceDiscovery/
├── Frontend Services
│   ├── CloudServiceDiscoveryService.ts    # Main orchestration
│   ├── providers/
│   │   ├── AWSDiscoveryClient.ts          # AWS resource discovery
│   │   ├── AzureDiscoveryClient.ts        # Azure resource discovery
│   │   └── GCPDiscoveryClient.ts          # GCP resource discovery
│   └── CloudResourceMapper.ts             # Resource-to-node mapping
│
├── UI Components
│   ├── CloudCredentialsDialog.tsx         # Credential input
│   ├── CloudResourceSelector.tsx          # Resource filtering
│   └── CloudDiscoveryProgress.tsx         # Progress tracking
│
└── Backend Routes
    └── cloudDiscoveryRoutes.js            # API endpoints
```

### Data Flow

```
1. User selects cloud provider (AWS/Azure/GCP)
2. CloudCredentialsDialog captures session credentials
3. CloudServiceDiscoveryService initiates discovery
4. Provider-specific client queries cloud APIs
5. CloudResourceMapper converts to vendor nodes
6. DiagramImportService creates final diagram
7. Credentials cleared from memory
```

## Vendor Node Mapping

### Priority System

**Discovery always prioritizes vendor-specific nodes:**

1. **Cloud Vendor Nodes** (Primary)
   - AWS: 77 specific node types (awsEC2, awsLambda, awsS3, etc.)
   - Azure: 49 specific node types (azureVM, azureFunctions, etc.)
   - GCP: 50 specific node types (gcpComputeEngine, gcpCloudRun, etc.)

2. **Generic Fallback** (Only if no vendor match)
   - Used only for unknown or unsupported resource types

### Resource Type Mapping

#### AWS Services
```typescript
{
  'AWS::EC2::Instance': 'awsEC2',
  'AWS::Lambda::Function': 'awsLambda',
  'AWS::RDS::DBInstance': 'awsRDS',
  'AWS::S3::Bucket': 'awsS3',
  'AWS::ElasticLoadBalancingV2::LoadBalancer': 'awsELB',
  'AWS::ECS::Service': 'awsECS',
  'AWS::EKS::Cluster': 'awsEKS',
  'AWS::DynamoDB::Table': 'awsDynamoDB',
  'AWS::ElastiCache::CacheCluster': 'awsElastiCache',
  'AWS::EC2::VPC': 'awsVPC',
  // ... 77 total mappings
}
```

#### Azure Services
```typescript
{
  'Microsoft.Compute/virtualMachines': 'azureVM',
  'Microsoft.Web/sites': 'azureAppService',
  'Microsoft.Sql/servers/databases': 'azureSQLDatabase',
  'Microsoft.Storage/storageAccounts': 'azureStorage',
  'Microsoft.Network/virtualNetworks': 'azureVirtualNetwork',
  'Microsoft.ContainerService/managedClusters': 'azureKubernetesService',
  'Microsoft.DocumentDB/databaseAccounts': 'azureCosmosDB',
  // ... 49 total mappings
}
```

#### GCP Services
```typescript
{
  'compute.googleapis.com/Instance': 'gcpComputeEngine',
  'run.googleapis.com/Service': 'gcpCloudRun',
  'sqladmin.googleapis.com/Instance': 'gcpCloudSQL',
  'storage.googleapis.com/Bucket': 'gcpCloudStorage',
  'container.googleapis.com/Cluster': 'gcpGKE',
  'cloudfunctions.googleapis.com/CloudFunction': 'gcpCloudFunctions',
  // ... 50 total mappings
}
```

## Security & Credentials

### Session-Only Architecture

**Credentials are NEVER persisted:**
- Stored in React state during active discovery
- Transmitted via HTTPS to backend only
- Used immediately for API calls
- Cleared on:
  - Discovery completion
  - Discovery cancellation
  - Window close
  - Manual "Clear Credentials" action

### Security Features

1. **No Storage**
   - No localStorage
   - No sessionStorage
   - No cookies
   - No file system writes

2. **Secure Transmission**
   - HTTPS-only API calls
   - Request signing with HMAC
   - Credential sanitization in logs

3. **Minimal Exposure**
   - Credentials in memory only during discovery
   - Backend validates before cloud API calls
   - Automatic timeout (5 minutes max)

### Backend Credential Handling

```javascript
// server/routes/cloudDiscoveryRoutes.js
app.post('/api/cloud/discover', async (req, res) => {
  const { provider, credentials, filters } = req.body;

  // Validate credentials (no storage)
  const isValid = await validateCredentials(provider, credentials);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Use credentials immediately
  const resources = await discoverResources(provider, credentials, filters);

  // Clear from memory
  credentials = null;

  res.json({ resources });
});
```

## Discovery Process

### AWS Discovery

**SDK**: `@aws-sdk/client-config-service`, `@aws-sdk/client-ec2`, `@aws-sdk/client-rds`

**Resources Discovered:**
- EC2 Instances (including tags, security groups, subnets)
- RDS Databases (instances, read replicas)
- Lambda Functions (with triggers)
- S3 Buckets (with policies)
- Load Balancers (ALB, NLB, CLB)
- ECS Services (tasks, containers)
- EKS Clusters (nodes, namespaces)
- VPCs (subnets, route tables)
- DynamoDB Tables
- ElastiCache Clusters

**API Query:**
```javascript
// AWS Config Service - discover all resources
const command = new SelectResourceConfigCommand({
  Expression: `
    SELECT
      resourceType,
      resourceId,
      resourceName,
      configuration,
      tags,
      availabilityZone
    WHERE resourceType IN [
      'AWS::EC2::Instance',
      'AWS::RDS::DBInstance',
      'AWS::Lambda::Function',
      'AWS::S3::Bucket'
    ]
  `
});
```

### Azure Discovery

**SDK**: `@azure/arm-resourcegraph`, `@azure/identity`

**Resources Discovered:**
- Virtual Machines (with NICs, disks)
- App Services (web apps, function apps)
- SQL Databases (servers, databases)
- Storage Accounts (containers, queues)
- Virtual Networks (subnets, NSGs)
- AKS Clusters (node pools)
- Cosmos DB Accounts
- Key Vaults

**API Query:**
```javascript
// Azure Resource Graph
const query = {
  query: `
    Resources
    | where type in~ [
      'Microsoft.Compute/virtualMachines',
      'Microsoft.Sql/servers/databases',
      'Microsoft.Storage/storageAccounts'
    ]
    | project
      name,
      type,
      location,
      resourceGroup,
      properties,
      tags
  `
};
```

### GCP Discovery

**SDK**: `@google-cloud/asset`

**Resources Discovered:**
- Compute Engine Instances (zones, machine types)
- Cloud Run Services (revisions)
- Cloud SQL Instances
- Cloud Storage Buckets
- GKE Clusters (node pools)
- Cloud Functions
- BigQuery Datasets

**API Query:**
```javascript
// Cloud Asset Inventory
const [assets] = await client.listAssets({
  parent: `projects/${projectId}`,
  contentType: 'RESOURCE',
  assetTypes: [
    'compute.googleapis.com/Instance',
    'run.googleapis.com/Service',
    'sqladmin.googleapis.com/Instance'
  ]
});
```

## Relationship Detection

### Connection Mapping

**AWS:**
- Security Groups → EC2 Instances
- Load Balancers → Target Groups → Instances
- RDS → VPC Subnets
- Lambda → EventBridge/API Gateway triggers

**Azure:**
- Network Interfaces → Virtual Machines
- Application Gateway → Backend Pools → VMs
- VNet → Subnets → Resources
- Function App → Storage Account (triggers)

**GCP:**
- VPC → Subnets → Instances
- Load Balancer → Backend Services → Instance Groups
- Cloud SQL → VPC Peering
- Cloud Run → Pub/Sub triggers

### Security Zone Assignment

**Automatic Zone Inference:**
```typescript
function inferSecurityZone(resource: CloudResource): SecurityZone {
  // Internet-facing resources
  if (resource.isPublic || resource.hasPublicIP) {
    return 'Internet';
  }

  // Load balancers and gateways
  if (resource.type.includes('LoadBalancer') ||
      resource.type.includes('Gateway')) {
    return 'DMZ';
  }

  // Database and storage
  if (resource.type.includes('Database') ||
      resource.type.includes('Storage')) {
    return 'Internal';
  }

  // Security services
  if (resource.type.includes('KeyVault') ||
      resource.type.includes('Secret')) {
    return 'Restricted';
  }

  return 'Internal'; // Default
}
```

## User Interface

### Discovery Workflow

1. **Import Dialog**
   - User clicks "Import Diagram"
   - Selects "Cloud Service Discovery" option

2. **Provider Selection**
   - Choose AWS, Azure, or GCP
   - View required credentials format

3. **Credential Input**
   - AWS: Access Key ID + Secret Access Key
   - Azure: Client ID + Client Secret + Tenant ID
   - GCP: Service Account JSON

4. **Resource Filtering**
   - Select regions to scan
   - Choose resource types
   - Tag-based filtering

5. **Discovery Progress**
   - Real-time resource count
   - Per-region progress
   - Estimated completion time
   - Cancel operation button

6. **Preview & Import**
   - Review discovered resources
   - Preview diagram layout
   - Confirm import or cancel

### UI Components

#### CloudCredentialsDialog
```typescript
interface CloudCredentialsDialogProps {
  open: boolean;
  provider: 'aws' | 'azure' | 'gcp';
  onSubmit: (credentials: CloudCredentials) => void;
  onCancel: () => void;
}
```

#### CloudResourceSelector
```typescript
interface CloudResourceSelectorProps {
  provider: 'aws' | 'azure' | 'gcp';
  regions: string[];
  resourceTypes: string[];
  onFilterChange: (filters: ResourceFilters) => void;
}
```

## Import Modes

### Replace vs Merge

Cloud discovery and all diagram imports support two modes:

#### Replace Mode (Default)
- **Behavior**: Clears existing diagram before importing
- **Use Case**: Starting a fresh architecture diagram
- **Result**: Only newly imported resources are displayed

```typescript
// User selects "Replace" mode
importMode: 'replace'
// → clearDiagram() → loadExampleSystem(importedDiagram)
```

#### Merge Mode
- **Behavior**: Adds imported resources to existing diagram
- **Use Case**: Combining multiple cloud providers or adding to existing work
- **Result**: Original + imported resources displayed together

```typescript
// User selects "Merge" mode
importMode: 'merge'
// → performMergeImport(importedDiagram, importSource)
```

### ID Collision Handling

When merging diagrams, ContextCypher automatically prevents ID conflicts:

1. **Prefix Generation**: Creates unique prefix from import source + timestamp
   ```typescript
   // Example: AWS import at timestamp
   prefix = 'aws_lx7k2p9_'
   ```

2. **Node ID Prefixing**: All imported node IDs are prefixed
   ```typescript
   // Original: 'i-1234567890abcdef'
   // Prefixed: 'aws_lx7k2p9_i-1234567890abcdef'
   ```

3. **Edge Reference Updates**: Source/target IDs updated to match prefixed nodes
   ```typescript
   // Edge source/target automatically updated to prefixed IDs
   ```

4. **Layout Offset**: Imported nodes positioned right of existing diagram
   ```typescript
   // Calculates max X position of existing nodes
   // Offsets imported nodes by: maxX + 300px
   ```

### Merge Validation

Post-merge validation checks:
- ✅ No duplicate node IDs
- ✅ No duplicate edge IDs
- ✅ All edges reference existing nodes
- ✅ Orphaned edge detection
- ⚠️ Warnings logged to console for review

### User Experience

#### CloudCredentialsDialog
```typescript
// Import mode selection in credentials dialog
<RadioGroup value={importMode}>
  <Radio value="replace" label="Replace - Clear existing diagram" />
  <Radio value="merge" label="Merge - Add to existing diagram" />
</RadioGroup>
```

#### ImportOptionsDialog
```typescript
// Same import mode UI for file-based imports
<RadioGroup value={options.importMode}>
  <Radio value="replace" />
  <Radio value="merge" />
</RadioGroup>
```

### Multi-Cloud Architecture

Merge mode enables building comprehensive multi-cloud architectures:

**Example Workflow:**
1. Import AWS infrastructure (Replace mode)
2. Import Azure resources (Merge mode) → Combined AWS + Azure
3. Import GCP services (Merge mode) → Combined AWS + Azure + GCP

**Result:** Single unified diagram showing cross-cloud architecture

### Context Preservation

Merged diagrams preserve metadata:

```typescript
mergedDiagram.customContext = `
${existingContext}

## Imported from ${importSource}
${importedContext}
`;

mergedDiagram.description =
  `${existing} (merged with ${importSource})`;
```

## Error Handling

### Common Scenarios

1. **Invalid Credentials**
   - Display clear error message
   - Offer retry with different credentials
   - Link to credential setup documentation

2. **Partial Discovery Failure**
   - Import successfully discovered resources
   - Warn about failed regions/resources
   - Provide failure details

3. **Timeout**
   - Show partial results
   - Offer retry for failed regions
   - Adjust timeout settings

4. **Rate Limiting**
   - Automatic retry with exponential backoff
   - Progress indication during retry
   - User notification of delays

### Error Messages

```typescript
const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid credentials. Please check your access keys.',
  TIMEOUT: 'Discovery timed out. Showing partial results.',
  RATE_LIMITED: 'Cloud provider rate limit reached. Retrying...',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  NO_RESOURCES: 'No resources found matching your filters.',
  PARTIAL_FAILURE: 'Some resources could not be discovered. Check logs.'
};
```

## Performance Considerations

### Optimization Strategies

1. **Parallel Discovery**
   - Query multiple regions concurrently
   - Use Promise.allSettled() for resilience

2. **Resource Batching**
   - Fetch resources in batches of 100
   - Prevent memory overflow

3. **Caching**
   - Cache region lists (1 hour TTL)
   - Cache resource type definitions

4. **Incremental Updates**
   - Stream discovered resources to UI
   - Update diagram progressively

### Rate Limiting

**AWS:**
- Config Service: 20 calls/second
- EC2 Describe: 100 calls/second

**Azure:**
- Resource Graph: 60 calls/minute
- Management API: 12,000 calls/hour

**GCP:**
- Cloud Asset: 60 calls/minute
- Compute API: 20 calls/second

## Dependencies

### NPM Packages

```json
{
  "dependencies": {
    "@aws-sdk/client-config-service": "^3.650.0",
    "@aws-sdk/client-ec2": "^3.650.0",
    "@aws-sdk/client-rds": "^3.650.0",
    "@aws-sdk/client-s3": "^3.650.0",
    "@aws-sdk/client-elasticloadbalancingv2": "^3.650.0",
    "@azure/arm-resourcegraph": "^5.1.0",
    "@azure/identity": "^4.4.1",
    "@google-cloud/asset": "^8.0.0",
    "@google-cloud/compute": "^4.8.0"
  }
}
```

### Backend Dependencies

```json
{
  "dependencies": {
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0"
  }
}
```

## Testing Strategy

### Unit Tests

1. **Resource Mapping**
   - Test all AWS/Azure/GCP type mappings
   - Verify vendor node prioritization
   - Validate fallback logic

2. **Credential Validation**
   - Test invalid credential handling
   - Verify credential clearing

3. **Relationship Detection**
   - Test connection mapping algorithms
   - Verify zone inference logic

### Integration Tests

1. **Discovery Flow**
   - Mock cloud provider responses
   - Test end-to-end discovery
   - Verify diagram generation

2. **Error Scenarios**
   - Test timeout handling
   - Test rate limit retries
   - Test partial failures

## Example Usage

### AWS Discovery

```typescript
// User provides credentials
const credentials = {
  accessKeyId: 'AKIA...',
  secretAccessKey: '***',
  region: 'us-east-1'
};

// Initiate discovery
const result = await cloudDiscoveryService.discoverAWS({
  credentials,
  filters: {
    regions: ['us-east-1', 'us-west-2'],
    resourceTypes: ['EC2', 'RDS', 'Lambda'],
    tags: { Environment: 'Production' }
  }
});

// Result contains vendor nodes
result.nodes.forEach(node => {
  console.log(node.type); // 'awsEC2', 'awsRDS', etc.
});
```

### Generated Diagram Structure

```json
{
  "nodes": [
    {
      "id": "i-1234567890abcdef0",
      "type": "awsEC2",
      "data": {
        "label": "web-server-01",
        "zone": "DMZ",
        "vendor": "aws",
        "region": "us-east-1",
        "instanceType": "t3.medium",
        "securityGroups": ["sg-12345"],
        "tags": { "Environment": "Production" }
      }
    },
    {
      "id": "db-1234567890",
      "type": "awsRDS",
      "data": {
        "label": "prod-database",
        "zone": "Internal",
        "vendor": "aws",
        "engine": "mysql",
        "instanceClass": "db.t3.large"
      }
    }
  ],
  "edges": [
    {
      "source": "i-1234567890abcdef0",
      "target": "db-1234567890",
      "data": {
        "protocol": "MySQL",
        "port": "3306"
      }
    }
  ]
}
```

## Future Enhancements

### Planned Features

1. **Multi-Account Support**
   - AWS Organizations
   - Azure Management Groups
   - GCP Folders

2. **Continuous Sync**
   - Periodic re-discovery
   - Change detection
   - Drift analysis

3. **Cost Estimation**
   - Resource cost mapping
   - Security cost analysis

4. **Compliance Mapping**
   - CIS Benchmarks
   - NIST Framework
   - SOC 2 controls

5. **Infrastructure as Code**
   - Export to Terraform
   - Export to CloudFormation
   - Export to ARM templates

## Troubleshooting

### Common Issues

**"Invalid Credentials"**
- Verify access key format
- Check IAM permissions
- Ensure credentials aren't expired

**"No Resources Found"**
- Check region selection
- Verify resource filters
- Review tag filters

**"Discovery Timeout"**
- Reduce number of regions
- Filter by resource types
- Check network connectivity

**"Rate Limited"**
- Wait for automatic retry
- Reduce concurrent requests
- Contact cloud provider support

## Security Best Practices

1. **Use Read-Only Credentials**
   - AWS: ReadOnlyAccess policy
   - Azure: Reader role
   - GCP: Viewer role

2. **Credential Hygiene**
   - Rotate credentials regularly
   - Use temporary credentials (STS)
   - Enable MFA where possible

3. **Network Security**
   - Use VPN for discovery
   - Whitelist IP addresses
   - Enable CloudTrail/Activity Logs

4. **Data Privacy**
   - Review discovered data
   - Sanitize sensitive information
   - Control diagram sharing

## Deployment Compatibility

### NPM Package (Local Installation) - ✅ Fully Supported

Cloud Service Discovery works **perfectly** with NPM package deployments:

**Advantages:**
- ✅ **No Timeout Limits**: Discoveries can run as long as needed
- ✅ **Full Memory Access**: No artificial memory constraints
- ✅ **Direct API Access**: Unrestricted outbound connections to cloud providers
- ✅ **Complete SDK Support**: All AWS, Azure, and GCP SDK features available
- ✅ **Real-time Streaming**: Progress updates work seamlessly
- ✅ **Multi-region Scans**: Can scan all regions without timeout issues
- ✅ **Large Environments**: Handle 1000+ resources without problems

**Recommended for:**
- Enterprise cloud environments
- Multi-cloud architectures
- Large-scale infrastructure discovery
- Production threat modeling workflows

### Vercel Deployment - ⚠️ Limited Support

Cloud Service Discovery has **significant limitations** on Vercel due to serverless constraints:

#### Known Limitations

1. **60-Second Function Timeout** ⏱️
   - **Issue**: Vercel functions have hard 60-second maximum execution time
   - **Impact**: Large discoveries will timeout before completion
   - **Affected**: Multi-region scans, environments with 100+ resources
   - **Workaround**: Limit to single region and specific resource types

2. **1024MB Memory Limit** 💾
   - **Issue**: Serverless functions have 1GB memory cap (configured in vercel.json)
   - **Impact**: Cloud SDKs processing large datasets may hit OOM errors
   - **Affected**: Large Azure Resource Graph queries, GCP asset inventories
   - **Workaround**: Filter resource types aggressively

3. **Cold Start Delays** ❄️
   - **Issue**: First request after idle loads all cloud SDKs from scratch
   - **Impact**: 5-10 second initialization delay on cold starts
   - **Affected**: All cloud discovery requests after idle period
   - **Workaround**: None - inherent serverless limitation

4. **No Streaming Support** 📡
   - **Issue**: Vercel doesn't support Server-Sent Events (SSE)
   - **Impact**: No real-time progress updates during discovery
   - **Affected**: All discovery operations
   - **Workaround**: Show loading spinner, return complete results only

5. **Network Egress Costs** 💰
   - **Issue**: Outbound API calls to cloud providers count toward Vercel limits
   - **Impact**: Heavy discovery usage could incur additional charges
   - **Affected**: Frequent or large-scale discoveries
   - **Workaround**: Monitor usage, implement rate limiting

#### What Works on Vercel

✅ **Small-scale discoveries**
- Single region scans
- < 50 resources per discovery
- Specific resource type filtering
- Credential validation
- Test connections

✅ **Lightweight operations**
- AWS region listing
- Resource type enumeration
- Credential testing endpoints

#### What May Fail on Vercel

❌ **Large-scale operations**
- Multi-region AWS discovery (likely timeout)
- Azure Resource Graph queries returning 100+ resources
- GCP projects with extensive asset inventories
- Cross-cloud discovery combining multiple providers

❌ **Real-time features**
- Progress streaming to UI
- Incremental resource loading
- Live update notifications

### Deployment Strategy Recommendations

#### For Users Requiring Cloud Discovery

**Option 1: NPM Package (Recommended)**
```bash
# Install globally for full cloud discovery support
npm install -g @contextcypher/app

# Run with no limitations
contextcypher
```

**Benefits:**
- Full feature set
- No timeouts or memory limits
- Best for enterprise use

**Option 2: Vercel (Demo/Testing Only)**
- Use for small proof-of-concept environments
- Limit to single region and specific resource types
- Implement UI warnings about limitations
- Display "Use NPM package for large environments" message

#### For Application Developers

**Frontend Detection:**
```typescript
// Detect deployment environment
const isVercel = process.env.VERCEL === '1';

if (isVercel) {
  // Show warning about cloud discovery limitations
  showWarning('Cloud discovery is limited on web deployment. Install NPM package for full features.');

  // Enforce limits
  maxRegions = 1;
  maxResources = 50;
  enableStreaming = false;
}
```

**Backend Timeout Handling:**
```javascript
// server/routes/cloudDiscoveryRoutes.js
router.post('/discover-aws', async (req, res) => {
  const isVercel = process.env.VERCEL === '1';

  if (isVercel) {
    // Implement aggressive timeout
    const timeout = setTimeout(() => {
      return res.status(504).json({
        error: 'Discovery timeout. Use NPM package for large environments.',
        partialResults: discoveredResources
      });
    }, 55000); // 55s to stay under 60s limit
  }

  // Continue with discovery...
});
```

### Production Deployment Checklist

**For NPM Package Users:**
- ✅ Install with `npm install -g @contextcypher/app`
- ✅ Verify Node.js 18.x or later
- ✅ Ensure network access to cloud provider APIs
- ✅ Configure read-only cloud credentials

**For Vercel Users:**
- ⚠️ Acknowledge timeout limitations (60s max)
- ⚠️ Test with sample environment first
- ⚠️ Implement resource count limits in UI
- ⚠️ Display deployment type warning to users
- ⚠️ Consider NPM package for production workloads

### Migration Path

**From Vercel to NPM Package:**
1. Export current diagrams as JSON
2. Install NPM package: `npm install -g @contextcypher/app`
3. Import diagrams into NPM version
4. Run full cloud discovery without limitations
5. Continue using NPM package for cloud-heavy workflows

## Version Information

- **Feature Version**: 1.6.0
- **Supported Clouds**: AWS, Azure, GCP
- **Vendor Nodes**: 176 types (77 AWS + 49 Azure + 50 GCP)
- **Dependencies Added**: 10 cloud SDKs
- **Files Created**: 8 new files
- **Files Modified**: 4 existing files
- **Deployment Support**:
  - NPM Package: Full support ✅
  - Vercel: Limited support (timeouts, memory constraints) ⚠️
  - Docker: Full support ✅
  - Desktop Installers: Full support ✅
