const express = require('express');
const router = express.Router();
const LangExtractDiagramClient = require('../services/LangExtractDiagramClient');
const logger = require('../utils/logger-wrapper');

// Initialize the LangExtract diagram client
const langExtractClient = new LangExtractDiagramClient();

/**
 * POST /api/langextract/diagram
 * Extract structured diagram data from AI response using LangExtract
 */
router.post('/diagram', async (req, res) => {
  try {
    const { aiResponse, context } = req.body;
    
    if (!aiResponse) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: aiResponse'
      });
    }
    
    logger.info('[LangExtract API] Processing diagram extraction request');
    
    // Extract diagram structure using LangExtract
    const result = await langExtractClient.extractDiagramStructure(aiResponse, context);
    
    if (result) {
      // Validate the extraction
      if (langExtractClient.validateExtraction(result)) {
        logger.info(`[LangExtract API] Successfully extracted ${result.nodes.length} nodes and ${result.edges.length} edges`);
        
        res.json({
          success: true,
          diagram: result,
          metadata: result.metadata || {}
        });
      } else {
        logger.warn('[LangExtract API] Extraction validation failed');
        res.json({
          success: false,
          error: 'Extracted diagram failed validation',
          diagram: null
        });
      }
    } else {
      logger.warn('[LangExtract API] Extraction returned null');
      res.json({
        success: false,
        error: 'Failed to extract diagram structure',
        diagram: null
      });
    }
  } catch (error) {
    logger.error('[LangExtract API] Error processing request:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/langextract/status
 * Check if LangExtract service is available
 */
router.get('/status', async (req, res) => {
  try {
    const response = await fetch(`${process.env.LANGEXTRACT_URL || 'http://localhost:8001'}/health`);
    
    if (response.ok) {
      const health = await response.json();
      res.json({
        available: true,
        service: 'langextract-diagram',
        ...health
      });
    } else {
      res.json({
        available: false,
        service: 'langextract-diagram',
        error: 'Service not responding'
      });
    }
  } catch (error) {
    res.json({
      available: false,
      service: 'langextract-diagram',
      error: error.message
    });
  }
});

module.exports = router;