const puppeteer = require('puppeteer');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const fs = require('fs').promises;
const path = require('path');

class ImageExportService {
  constructor() {
    this.browser = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: true, // Use boolean for newer Puppeteer versions
        ignoreHTTPSErrors: true,
        dumpio: false,
      });
      this.isInitialized = true;
      console.log('Puppeteer browser initialized for image export');
    } catch (error) {
      console.error('Failed to initialize Puppeteer:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
    }
  }

  async toHtml(flow, styles) {
    // Create a minimal HTML document with ReactFlow
    const html = `
      <!DOCTYPE html>
      <html style="overflow: hidden;">
        <head>
          <meta charset="UTF-8">
          <style>
            /* ReactFlow base styles */
            ${styles.reactFlowStyles || ''}
            
            /* Custom styles for the export */
            html, body { 
              margin: 0; 
              width: ${flow.width}px; 
              height: ${flow.height}px;
              background: ${flow.background || '#ffffff'};
            }
            
            /* Security node styles */
            .security-node {
              background: white;
              border: 2px solid #ccc;
              border-radius: 8px;
              padding: 10px;
              font-family: Arial, sans-serif;
            }
            
            .security-zone {
              border: 2px dashed;
              border-radius: 12px;
              padding: 20px;
              background-color: rgba(255, 255, 255, 0.1);
            }
            
            .security-zone-dmz { 
              border-color: #ff9800; 
              background-color: rgba(255, 152, 0, 0.1);
            }
            
            .security-zone-trusted { 
              border-color: #4caf50;
              background-color: rgba(76, 175, 80, 0.1); 
            }
            
            .security-zone-untrusted { 
              border-color: #f44336;
              background-color: rgba(244, 67, 54, 0.1);
            }
            
            .security-zone-restricted { 
              border-color: #9c27b0;
              background-color: rgba(156, 39, 176, 0.1);
            }
            
            /* Edge styles */
            .react-flow__edge-path { 
              stroke: #999; 
              fill: none; 
              stroke-width: 2; 
            }
            
            .react-flow__edge-text {
              fill: #333;
              font-size: 12px;
            }
            
            /* Additional theme styles */
            ${styles.themeStyles || ''}
          </style>
        </head>
        <body>
          <div id="react-flow-container" style="width: 100%; height: 100%;">
            ${flow.content}
          </div>
        </body>
      </html>
    `;
    
    return html;
  }

  async renderFlowToHtml(nodes, edges, width, height, background) {
    // Convert nodes and edges to a simple HTML representation
    // This is a simplified version - in production, you'd want to properly render ReactFlow components
    let content = '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">';
    
    // Add background
    content += `<rect width="${width}" height="${height}" fill="${background || '#ffffff'}"/>`;
    
    // Render security zones first (they should be in the background)
    const zoneNodes = nodes.filter(node => node.type === 'securityZone');
    for (const zone of zoneNodes) {
      const zoneClass = `security-zone-${zone.data.zone}`;
      const color = this.getZoneColor(zone.data.zone);
      content += `
        <rect x="${zone.position.x}" y="${zone.position.y}" 
              width="${zone.width || 300}" height="${zone.height || 200}"
              rx="12" ry="12"
              fill="${color.bg}" stroke="${color.border}" stroke-width="2"
              stroke-dasharray="5,5" opacity="0.3"/>
        <text x="${zone.position.x + 10}" y="${zone.position.y + 25}" 
              fill="${color.border}" font-size="14" font-weight="bold">
          ${zone.data.label || zone.data.zone.toUpperCase()}
        </text>
      `;
    }
    
    // Render edges
    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) continue;
      
      // Simple straight line - in production, use proper bezier curves
      const x1 = sourceNode.position.x + (sourceNode.width || 150) / 2;
      const y1 = sourceNode.position.y + (sourceNode.height || 50);
      const x2 = targetNode.position.x + (targetNode.width || 150) / 2;
      const y2 = targetNode.position.y;
      
      content += `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              stroke="#999" stroke-width="2" marker-end="url(#arrowhead)"/>
      `;
      
      // Add label if exists
      if (edge.data?.label) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        content += `
          <text x="${midX}" y="${midY}" text-anchor="middle"
                fill="#333" font-size="12" dy="-5">
            ${edge.data.label}
          </text>
        `;
      }
    }
    
    // Render nodes (excluding zones)
    const regularNodes = nodes.filter(node => node.type !== 'securityZone');
    for (const node of regularNodes) {
      const x = node.position.x;
      const y = node.position.y;
      const width = node.width || 150;
      const height = node.height || 50;
      
      // Node background
      content += `
        <rect x="${x}" y="${y}" width="${width}" height="${height}"
              rx="8" ry="8" fill="white" stroke="#ccc" stroke-width="2"/>
      `;
      
      // Node icon (simplified)
      if (node.data.icon) {
        content += `
          <text x="${x + 10}" y="${y + 30}" font-size="20">
            ${this.getNodeIcon(node.type)}
          </text>
        `;
      }
      
      // Node label
      content += `
        <text x="${x + 40}" y="${y + 30}" font-size="14" fill="#333">
          ${node.data.label || node.type}
        </text>
      `;
    }
    
    // Add arrow marker definition
    content += `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#999" />
        </marker>
      </defs>
    `;
    
    content += '</svg>';
    
    return {
      content,
      width,
      height,
      background
    };
  }

  getZoneColor(zone) {
    const colors = {
      dmz: { border: '#ff9800', bg: 'rgba(255, 152, 0, 0.1)' },
      trusted: { border: '#4caf50', bg: 'rgba(76, 175, 80, 0.1)' },
      untrusted: { border: '#f44336', bg: 'rgba(244, 67, 54, 0.1)' },
      restricted: { border: '#9c27b0', bg: 'rgba(156, 39, 176, 0.1)' }
    };
    return colors[zone] || colors.trusted;
  }

  getNodeIcon(type) {
    const icons = {
      server: '🖥️',
      database: '🗄️',
      application: '📱',
      user: '👤',
      firewall: '🛡️',
      loadBalancer: '⚖️',
      container: '📦',
      service: '⚙️',
      api: '🔌',
      storage: '💾'
    };
    return icons[type] || '📄';
  }

  async toImage(flow, type = 'png') {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const page = await this.browser.newPage();
    
    try {
      console.log('Starting image generation:', { type, width: flow.width, height: flow.height });
      // Set viewport
      await page.setViewport({ 
        width: flow.width, 
        height: flow.height,
        deviceScaleFactor: 2 // Higher quality
      });
      
      // Render the flow to HTML
      const renderedFlow = await this.renderFlowToHtml(
        flow.nodes,
        flow.edges,
        flow.width,
        flow.height,
        flow.background
      );
      
      // Get ReactFlow styles (you might need to adjust the path)
      const reactFlowStyles = await this.getReactFlowStyles();
      
      // Create full HTML
      const html = await this.toHtml(renderedFlow, {
        reactFlowStyles,
        themeStyles: flow.themeStyles || ''
      });
      
      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Wait a bit for rendering - use evaluate with setTimeout for compatibility
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
      
      // Take screenshot
      const imageBuffer = await page.screenshot({ 
        type,
        fullPage: false,
        omitBackground: false,
        quality: type === 'jpeg' ? 90 : undefined
      });
      
      return imageBuffer;
      
    } finally {
      await page.close();
    }
  }

  async getReactFlowStyles() {
    try {
      // Try to read ReactFlow styles from node_modules
      const stylePath = path.join(__dirname, '../../node_modules/@xyflow/react/dist/style.css');
      const styles = await fs.readFile(stylePath, 'utf-8');
      return styles;
    } catch (error) {
      console.warn('Could not load ReactFlow styles:', error);
      // Return minimal styles as fallback
      return `
        .react-flow { position: relative; width: 100%; height: 100%; }
        .react-flow__viewport { position: relative; width: 100%; height: 100%; }
        .react-flow__node { position: absolute; }
        .react-flow__edge { position: absolute; pointer-events: none; }
      `;
    }
  }
}

// Export singleton instance
module.exports = new ImageExportService();