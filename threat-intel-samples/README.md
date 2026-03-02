# Threat Intelligence Sample Files

This directory contains example threat intelligence files for testing the SecOps features of AI Threat Modeler.

## Files

### 1. example-threat-intel.json
- **Format**: Native AI Threat Modeler format
- **Content**: Comprehensive threat intel including APT29, APT28, and Lazarus Group
- **Features**:
  - Full ATP group profiles with aliases
  - TTP mappings to MITRE ATT&CK
  - Detection rules (Sigma, KQL, Splunk)
  - Contextual IoCs for different environments
  - Custom behavioral indicators

### 2. mitre-attack-sample.json
- **Format**: STIX 2.1 (MITRE ATT&CK standard)
- **Content**: Simplified MITRE format with APT29 example
- **Use**: Test STIX format parser

### 3. threat-actors.csv
- **Format**: CSV
- **Content**: Simple mapping of APT groups to techniques
- **Use**: Test CSV import functionality

### 4. targeted-threat-examples.json
- **Format**: Targeted threat scenarios with integrated threat intelligence
- **Content**: Complete examples for testing the Targeted Threat Analysis feature
- **Features**:
  - Pre-filled threat actor profiles (APT29, APT28, Lazarus, Ransomware groups)
  - Integrated threat intelligence with raw reports, CVEs, IOCs, and campaign info
  - Real-world scenarios (government, financial, critical infrastructure, healthcare)
  - Ready-to-use examples for each threat intelligence field

## How to Use

1. **Enable SecOps in Settings**:
   - Open Settings (gear icon)
   - Go to SecOps tab
   - Enable "SecOps Analysis Features"

2. **Upload Threat Intel**:
   - In Settings > SecOps tab
   - Click "Add Threat Intel Source"
   - Select one of these sample files
   - The filename will be added to your configured sources

3. **Run Analysis**:
   - Switch to SecOps panel (left sidebar tabs)
   - Click "Run Analysis"
   - View APT actors, TTP coverage, and detection gaps

## Using Targeted Threat Analysis with Threat Intelligence

### How to Use the Examples

1. **Open Threat Analysis Panel**:
   - Click the "Threat Analysis" tab in the left sidebar
   - Click "Targeted Analysis Mode"

2. **Fill in Threat Actor Information**:
   - Copy fields from `targeted-threat-examples.json`
   - Paste into the corresponding fields:
     - Threat Actors
     - TTPs
     - Known Vulnerabilities
     - Focus Areas
     - Scenario Description

3. **Add Threat Intelligence** (Optional):
   - Expand the "Threat Intelligence" section
   - Copy and paste from the example's `threatIntelligence` fields:
     - Raw Threat Intelligence
     - Recent CVEs
     - Known IOCs
     - Campaign Information
     - Intelligence Date

4. **Run Analysis**:
   - Click "Analyze" to generate threat analysis
   - The AI will incorporate the threat intelligence into its analysis
   - Export results will include all threat intelligence data

### Example Usage

For APT29 targeting a government agency:
1. Copy the "APT29 Cozy Bear Campaign" example
2. Paste each field into the Targeted Analysis form
3. Include the threat intelligence for current campaign data
4. Run analysis to get specific recommendations based on latest intelligence

## Testing Different Scenarios

### Scenario 1: Government Agency
Build a diagram with:
- Exchange server
- Active Directory
- Workstations
- File servers

Expected: High relevance for APT29 (targets government)

### Scenario 2: Financial Institution
Build a diagram with:
- Banking applications
- Database servers
- ATM network
- Cryptocurrency wallet

Expected: High relevance for Lazarus Group (financial motivated)

### Scenario 3: Defense Contractor
Build a diagram with:
- Classified network
- R&D systems
- Email servers
- VPN gateway

Expected: High relevance for APT28 (targets defense)

## Data Sources

These examples are based on public threat intelligence from:
- MITRE ATT&CK Framework
- Various threat intelligence reports
- Open source cyber threat data

Note: IP addresses and domains in these files are examples only and should not be used for blocking or security decisions.