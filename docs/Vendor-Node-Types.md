# Vendor Node Types Documentation

## Overview
This document describes the cloud vendor-specific node types added to the ContextCypher threat modeling application. These nodes allow users to model infrastructure using AWS, Azure, GCP, and IBM cloud services.

## Total Cloud Vendor Services
- **AWS**: 77 services (40 core + 37 additional)
- **Azure**: 49 services (19 core + 30 additional)
- **GCP**: 50 services (15 core + 35 additional)
- **IBM**: 35 services

**Total: 211 cloud vendor node types** with complete icon mappings, color definitions, and DFD category assignments.

## AWS Services (77 nodes)

### Core Services (40 nodes)

### Compute
- **awsEC2** - Elastic Compute Cloud - Virtual Servers
  - Color: `#FF9900` (AWS Orange)
  - Icon: CloudIcon
  - Description: Scalable virtual servers in the cloud

- **awsLambda** - Lambda
  - Color: `#FF9900`
  - Icon: FunctionsIcon
  - Description: Serverless compute service for running code without managing servers

- **awsElasticBeanstalk** - Elastic Beanstalk
  - Color: `#FF9900`
  - Icon: CloudIcon
  - Description: Easy-to-use service for deploying and scaling web applications

### Containers
- **awsECS** - Elastic Container Service
  - Color: `#FF9900`
  - Icon: AllInboxIcon
  - Description: Fully managed container orchestration service

- **awsEKS** - Elastic Kubernetes Service
  - Color: `#FF9900`
  - Icon: ViewInArIcon
  - Description: Managed Kubernetes service for running containerized applications

- **awsFargate** - Fargate
  - Color: `#FF9900`
  - Icon: AllInboxIcon
  - Description: Serverless compute for containers

### Storage
- **awsS3** - Simple Storage Service
  - Color: `#569A31` (AWS Storage Green)
  - Icon: StorageIcon
  - Description: Object storage service for storing and retrieving data

- **awsEBS** - Elastic Block Store
  - Color: `#569A31`
  - Icon: StorageIcon
  - Description: High-performance block storage for EC2 instances

- **awsEFS** - Elastic File System
  - Color: `#569A31`
  - Icon: FolderIcon
  - Description: Managed NFS file system for EC2 instances

### Database
- **awsRDS** - Relational Database Service
  - Color: `#205081` (AWS Database Blue)
  - Icon: StorageIcon
  - Description: Managed relational database service supporting multiple engines

- **awsDynamoDB** - DynamoDB
  - Color: `#205081`
  - Icon: DataUsageIcon
  - Description: Fully managed NoSQL database service

- **awsElastiCache** - ElastiCache
  - Color: `#205081`
  - Icon: MemoryIcon
  - Description: In-memory caching service for Redis and Memcached

### Networking
- **awsVPC** - Virtual Private Cloud
  - Color: `#9D5025` (AWS Network Brown)
  - Icon: CloudCircleIcon
  - Description: Isolated network environment in AWS

- **awsCloudFront** - CloudFront
  - Color: `#9D5025`
  - Icon: PublicIcon
  - Description: Content Delivery Network service

- **awsAPIGateway** - API Gateway
  - Color: `#FF9900`
  - Icon: ApiIcon
  - Description: Fully managed service for creating and managing APIs

### Additional AWS Services (37 nodes)
Additional AWS services added for comprehensive cloud coverage:
- **Storage**: Glacier (Archive Storage), EBS Snapshots
- **Security**: GuardDuty, Secrets Manager, Security Hub, WAF, Shield, Inspector, Macie, Detective
- **Identity**: SSO, Cognito, IAM Identity Center
- **Networking**: Direct Connect, Transit Gateway, Global Accelerator, Route 53
- **Management**: CloudWatch, CloudTrail, Config, Systems Manager, OpsWorks, Service Catalog
- **Container/Orchestration**: ECR, App Runner, Batch
- **Integration**: SNS, SQS, EventBridge, Step Functions
- **Analytics**: Athena, Kinesis, EMR, Redshift, QuickSight
- **AI/ML**: SageMaker, Bedrock, Comprehend, Rekognition
- **Developer Tools**: CodePipeline, CodeBuild, CodeDeploy, CodeCommit

All services include Material-UI icon mappings and proper color assignments.

## Azure Services (49 nodes)

### Core Services (19 nodes)

### Compute
- **azureVM** - Virtual Machines
  - Color: `#0078D4` (Azure Blue)
  - Icon: ComputerIcon
  - Description: Scalable virtual machines in Azure

- **azureAppService** - App Service
  - Color: `#0078D4`
  - Icon: WebAssetIcon
  - Description: Platform for building and hosting web applications

- **azureFunctions** - Functions
  - Color: `#0078D4`
  - Icon: FunctionsIcon
  - Description: Serverless compute service for event-driven applications

- **azureContainerInstances** - Container Instances
  - Color: `#0078D4`
  - Icon: AllInboxIcon
  - Description: Run containers without managing servers

### Storage
- **azureBlobStorage** - Blob Storage
  - Color: `#0078D4`
  - Icon: StorageIcon
  - Description: Object storage for unstructured data

- **azureFileStorage** - File Storage
  - Color: `#0078D4`
  - Icon: FolderIcon
  - Description: Managed file shares in the cloud

- **azureManagedDisks** - Managed Disks
  - Color: `#0078D4`
  - Icon: StorageIcon
  - Description: High-performance block storage for Azure VMs

- **azureStorage** - Storage Account
  - Color: `#0078D4`
  - Icon: StorageIcon
  - Description: General purpose storage service

### Database
- **azureSQLDatabase** - SQL Database
  - Color: `#0078D4`
  - Icon: StorageIcon
  - Description: Managed relational database service

- **azureCosmosDB** - Cosmos DB
  - Color: `#0078D4`
  - Icon: PublicIcon
  - Description: Globally distributed, multi-model NoSQL database

- **azureRedisCache** - Redis Cache
  - Color: `#0078D4`
  - Icon: StorageIcon
  - Description: In-memory data store for caching

### Networking
- **azureVirtualNetwork** - Virtual Network
  - Color: `#0078D4`
  - Icon: CloudCircleIcon
  - Description: Private network in Azure cloud

- **azureLoadBalancer** - Load Balancer
  - Color: `#0078D4`
  - Icon: BalanceIcon
  - Description: High availability load balancing service

- **azureApplicationGateway** - Application Gateway
  - Color: `#0078D4`
  - Icon: WebAssetIcon
  - Description: Web traffic load balancer with WAF capabilities

- **azureFrontDoor** - Front Door
  - Color: `#0078D4`
  - Icon: WebAssetIcon
  - Description: Global load balancing and CDN service

### Container Services
- **azureKubernetesService** - Azure Kubernetes Service (AKS)
  - Color: `#0078D4`
  - Icon: ViewInArIcon
  - Description: Managed Kubernetes service for containerized applications

### Monitoring & Security
- **azureMonitor** - Monitor
  - Color: `#0078D4`
  - Icon: MonitorIcon
  - Description: Full-stack monitoring and analytics service

- **azureActiveDirectory** - Azure AD
  - Color: `#0078D4`
  - Icon: AccountTreeIcon
  - Description: Identity and access management service

- **azureKeyVault** - Key Vault
  - Color: `#0078D4`
  - Icon: LockIcon
  - Description: Secure key and secret management service

### Additional Azure Services (30 nodes)
Additional Azure services added for comprehensive cloud coverage:
- **Security**: Sentinel (SIEM), Defender for Cloud, Log Analytics, Security Center, DDoS Protection, Firewall
- **Identity**: Azure AD B2C, Managed Identity, Privileged Identity Management
- **Networking**: ExpressRoute, VPN Gateway, Traffic Manager, CDN, Bastion, Firewall Manager
- **Management**: Policy, Automation, Backup, Site Recovery, Cost Management, Resource Manager
- **Integration**: Logic Apps, Service Bus, Event Grid, API Management
- **AI/ML**: Cognitive Services, Machine Learning, Bot Service
- **Developer Tools**: DevOps, Pipelines, Repos, Artifacts
- **IoT**: IoT Hub, IoT Central
- **Database**: PostgreSQL, MySQL, Synapse Analytics

All services include Material-UI icon mappings and proper color assignments.

## GCP Services (50 nodes)

### Core Services (15 nodes)

### Compute
- **gcpComputeEngine** - Compute Engine
  - Color: `#4285F4` (GCP Blue)
  - Icon: ComputerIcon
  - Description: Virtual machines running in Google's data centers

- **gcpAppEngine** - App Engine
  - Color: `#4285F4`
  - Icon: CloudIcon
  - Description: Fully managed serverless platform for applications

- **gcpCloudFunctions** - Cloud Functions
  - Color: `#4285F4`
  - Icon: FunctionsIcon
  - Description: Event-driven serverless compute platform

- **gcpCloudRun** - Cloud Run
  - Color: `#4285F4`
  - Icon: DirectionsRunIcon
  - Description: Fully managed platform for containerized applications

### Container Services
- **gcpGKE** - Google Kubernetes Engine
  - Color: `#4285F4`
  - Icon: ViewInArIcon
  - Description: Managed Kubernetes service for deploying containerized apps

- **gcpContainerRegistry** - Container Registry
  - Color: `#4285F4`
  - Icon: AllInboxIcon
  - Description: Store and manage Docker container images

### Storage
- **gcpCloudStorage** - Cloud Storage
  - Color: `#4285F4`
  - Icon: StorageIcon
  - Description: Object storage service for any amount of data

- **gcpPersistentDisk** - Persistent Disk
  - Color: `#4285F4`
  - Icon: StorageIcon
  - Description: Block storage for VM instances

### Database
- **gcpCloudSQL** - Cloud SQL
  - Color: `#4285F4`
  - Icon: StorageIcon
  - Description: Fully managed relational database service

- **gcpFirestore** - Firestore
  - Color: `#FFA000` (Firebase Orange)
  - Icon: DataUsageIcon
  - Description: NoSQL document database for mobile and web apps

- **gcpBigQuery** - BigQuery
  - Color: `#4285F4`
  - Icon: QueryStatsIcon
  - Description: Serverless, highly scalable data warehouse

- **gcpBigtable** - Bigtable
  - Color: `#4285F4`
  - Icon: TableRowsIcon
  - Description: Scalable NoSQL wide-column database

### AI/ML
- **gcpVertexAI** - Vertex AI
  - Color: `#34A853` (Google Green)
  - Icon: PsychologyIcon
  - Description: Unified ML platform for building and deploying models

### Networking
- **gcpVPC** - Virtual Private Cloud
  - Color: `#4285F4`
  - Icon: CloudCircleIcon
  - Description: Virtual Private Cloud networking

- **gcpCloudLoadBalancing** - Cloud Load Balancing
  - Color: `#4285F4`
  - Icon: BalanceIcon
  - Description: High performance, scalable load balancing

### Additional GCP Services (35 nodes)
Additional GCP services added for comprehensive cloud coverage:
- **Security**: Security Command Center, Cloud DLP, Cloud Armor, Binary Authorization, Secret Manager, KMS
- **Identity**: Cloud Identity, Identity Platform, IAM
- **Networking**: Cloud CDN, Cloud NAT, Cloud Interconnect, Cloud DNS, VPC Service Controls
- **Management**: Cloud Logging, Cloud Monitoring, Cloud Trace, Cloud Debugger, Operations Suite
- **Integration**: Cloud Pub/Sub, Cloud Tasks, Cloud Scheduler, Workflows
- **AI/ML**: AutoML, AI Platform, Vision AI, Natural Language AI, Translation AI
- **Database**: Cloud Spanner, Memorystore, Datastore
- **Analytics**: Dataflow, Dataproc, Data Fusion, Looker
- **Developer Tools**: Cloud Build, Cloud Source Repositories, Artifact Registry
- **API Management**: Apigee, API Gateway

All services include Material-UI icon mappings and proper color assignments.

## IBM Services (35 nodes)

IBM Cloud services covering key infrastructure and platform capabilities:
- **Compute**: Virtual Servers, Code Engine, Cloud Functions, Kubernetes Service
- **Storage**: Cloud Object Storage, Block Storage, File Storage
- **Database**: Cloudant, Db2, PostgreSQL, MongoDB
- **Security**: Security Advisor, Key Protect, Secrets Manager, Certificate Manager
- **Identity**: IAM, App ID, MFA
- **Networking**: Virtual Private Cloud, Cloud Internet Services, Direct Link, Transit Gateway
- **Monitoring**: Activity Tracker, Log Analysis, Cloud Monitoring, Sysdig
- **AI/ML**: Watson Studio, Watson Assistant, Watson Discovery, Natural Language Understanding
- **DevOps**: Continuous Delivery, Toolchain, Code Risk Analyzer
- **Integration**: Event Streams, MQ, API Connect

All services include Material-UI icon mappings with IBM-branded colors (purple/blue theme).

## Integration with ContextCypher

### Node Categories
All vendor nodes are organized under their respective vendor categories in the NodeToolbox:
- **AWS Services** - Orange themed (#FF9900) - 77 services
- **Azure Services** - Blue themed (#0078D4) - 49 services
- **GCP Services** - Blue themed (#4285F4) - 50 services
- **IBM Services** - Purple/Blue themed - 35 services

### DFD Category Mappings
All vendor nodes are mapped to appropriate DFD categories:
- Compute services → 'externalEntities'
- Storage services → 'dataStores'
- Database services → 'dataStores'
- Network services → 'processes'
- Container services → 'externalEntities'
- AI/ML services → 'processes'

### Security Zones
All vendor nodes have default security zone assignments:
- Public-facing services (CDN, Load Balancers) → 'internet'
- Compute and container services → 'dmz'
- Storage and database services → 'internal'
- Security services (Key Vault, IAM) → 'restricted'

### Data Classification
Default data classification levels:
- Storage services → 'confidential'
- Database services → 'confidential'
- Compute services → 'internal'
- Network services → 'public'

## Usage Examples

### Creating Vendor Nodes
1. Open the NodeToolbox in the diagram editor
2. Navigate to the vendor category (AWS/Azure/GCP)
3. Drag and drop the desired service node onto the canvas
4. The node will be created with appropriate icon, color, and security settings

### Example Architectures
Example systems have been created to demonstrate vendor node usage:
- **AWS Multi-Region Architecture** - Shows AWS services across multiple regions
- **Azure Cloud Identity Gaps** - Azure SaaS deployment with identity and access control drift
- **GCP Cloud Data Leak** - GCP environment with data exfiltration vulnerabilities
- **Hybrid Cloud Architectures** - Multi-cloud and hybrid deployments

All example systems use Material-UI fallback icons by default for consistency and performance.

## Icon System

### Two-Tier Icon Architecture

ContextCypher uses a sophisticated two-tier icon system for cloud vendor services:

#### 1. Material-UI Fallback Icons (Default)
- **177 mappings** defined in `src/utils/materialIconMappings.ts`
- **Automatically assigned** when nodes are dropped from NodeToolbox
- **Purpose**: Provide semantic, consistent icons that represent service function
- **Examples**:
  - Security services → `SecurityIcon`, `ShieldIcon`
  - Storage services → `StorageIcon`, `FolderIcon`
  - Compute services → `CloudIcon`, `ComputerIcon`
  - Monitoring services → `MonitorIcon`, `RadarIcon`

#### 2. Vendor-Specific SVG Icons (Optional)
- **1,881 official vendor icons** available in `/public/vendor-icons/`
  - AWS: 878 icons (organized by service category)
  - Azure: 693 icons
  - GCP: 45 icons
  - IBM: 265 icons
- **User-selectable** via IconSelector component in NodeEditor
- **Searchable** by service name, category, and keywords
- **Persisted** in diagram JSON with `vendor:` prefix
- **Located**: `/public/vendor-icons/{vendor}/{category}/{icon-file}.svg`

### How Icons Are Assigned

**On Node Creation** (DiagramEditor.tsx:1471):
```typescript
const iconDefaults = getDefaultIconForType(type);
// Returns Material-UI icon from materialIconMappings
```

**Icon Rendering Priority** (SecurityNodes.tsx:1135):
```typescript
let iconToRender = data.icon || nodeTypeConfig[type]?.icon;
// 1. User-selected custom icon (if manually changed)
// 2. Default Material-UI icon for node type
```

**Icon Serialization**:
- Vendor SVG icons saved as: `"vendor:aws/security/Arch_Amazon-GuardDuty_48.svg"`
- Material-UI icons saved as mapping keys: `"awsGuardDuty"`

### Accessing Vendor Icons

Users can manually select official vendor SVG icons:
1. Double-click any cloud vendor node
2. In NodeEditor, click the icon selector
3. Browse or search 1,881 categorized vendor icons
4. Selected icon persists in diagram JSON

### Icon Coverage Status

✅ **Complete Coverage**
- All 211 cloud vendor node types have Material-UI fallback icons
- All icons mapped to semantically appropriate Material-UI components
- All vendor SVG icons accessible via IconSelector
- Complete color definitions in Theme.ts
- Complete DFD category mappings

### Why Material-UI Icons Are Default

Material-UI icons are used by default because they:
- Provide **semantic consistency** (security services always use security-related icons)
- **Scale perfectly** at any zoom level (vector-based)
- **Load instantly** (no network requests)
- **Match application theme** (color-aware, theme-responsive)
- **Work offline** (embedded in application bundle)

Vendor SVG icons are available as an **optional visual enhancement** for users who want authentic cloud provider branding.

## Best Practices

### When to Use Vendor Nodes
- Modeling cloud-native architectures
- Creating detailed infrastructure diagrams
- Performing threat analysis on cloud deployments
- Documenting multi-cloud or hybrid architectures

### Security Considerations
- Always verify the default security zone assignments
- Update data classification based on actual usage
- Consider network boundaries between services
- Document inter-service authentication and authorization

### Performance Notes
- Vendor nodes render identically to standard nodes
- No performance impact from using vendor-specific nodes
- Material-UI icons load instantly (embedded in bundle)
- Vendor SVG icons are lazy-loaded on demand

## Technical Implementation

### Key Files

**Icon System**:
- `src/utils/materialIconMappings.ts` - 177 Material-UI icon mappings for all cloud services
- `src/utils/vendorIconMappings.ts` - Vendor SVG icon loading and caching system
- `src/data/vendorIconsManifest.json` - Index of 1,881 vendor SVG icons
- `src/utils/iconSerialization.ts` - Icon persistence and deserialization

**Node Configuration**:
- `src/components/SecurityNodes.tsx` - Node rendering with icon priority system
- `src/utils/dfdCategoryMappings.ts` - DFD category assignments for all 211 node types
- `src/styles/Theme.ts` - Color definitions for all vendor services

**Node Creation**:
- `src/components/DiagramEditor.tsx` - Node drop handling with icon assignment
- `src/components/NodeToolbox.tsx` - Vendor service categories and drag-and-drop
- `src/components/NodeEditor.tsx` - Manual icon selection via IconSelector
- `src/components/IconSelector.tsx` - Searchable vendor icon browser

### Icon Assignment Flow

1. **Node Created**: User drags service from NodeToolbox
2. **Default Icon**: `getDefaultIconForType()` assigns Material-UI icon
3. **Node Rendered**: SecurityNodes.tsx displays icon with proper color
4. **Optional Override**: User can manually select vendor SVG via NodeEditor
5. **Persistence**: Icon saved in diagram JSON (Material-UI key or vendor: path)
6. **Load**: `deserializeIcon()` restores icon from saved diagram

### Adding New Vendor Services

To add a new cloud vendor service:

1. **Add SecurityNodeType** in `src/types/SecurityTypes.ts`:
   ```typescript
   export type SecurityNodeType =
     | 'awsNewService'
     | ... existing types
   ```

2. **Add Material-UI Icon Mapping** in `src/utils/materialIconMappings.ts`:
   ```typescript
   awsNewService: {
     icon: AppropriateIcon,
     name: 'New Service',
     category: 'aws',
     keywords: ['aws', 'service', 'keyword']
   }
   ```

3. **Add Color** in `src/styles/Theme.ts` (if new category):
   ```typescript
   awsNewServiceColor: '#FF9900'
   ```

4. **Add Node Configuration** in `src/components/SecurityNodes.tsx`:
   ```typescript
   awsNewService: {
     icon: materialIconMappings.awsNewService.icon,
     color: 'awsNewServiceColor'
   }
   ```

5. **Add DFD Category** in `src/utils/dfdCategoryMappings.ts`:
   ```typescript
   awsNewService: 'process' // or 'dataStore', 'actor', null
   ```

6. **Add to NodeToolbox** in `src/components/NodeToolbox.tsx`:
   ```typescript
   { type: 'awsNewService', label: 'New Service', category: 'aws' }
   ```

### Version Information

- **Feature Added**: v1.5.0
- **Total Node Types**: 211 cloud vendor services
- **Material-UI Icons**: 177 mappings
- **Vendor SVG Icons**: 1,881 available
- **Files Modified**: 15+ core files
- **Test Coverage**: TypeScript compilation verified