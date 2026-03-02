// Risk Matrix Calculation for Qualitative Assessment (6x6 Lookup Table)

const riskMatrix = {
  // Likelihood levels with numeric values (1-6 scale)
  likelihood: {
    'Almost Certain': 6,
    'Likely': 5,
    'Possible': 4,
    'Unlikely': 3,
    'Very Unlikely': 2,
    'Rare': 1
  },
  
  // Impact levels with numeric values (1-6 scale)
  impact: {
    'Catastrophic': 6,
    'Severe': 5,
    'Major': 4,
    'Moderate': 3,
    'Minor': 2,
    'Negligible': 1
  },
  
  // Risk matrix lookup table - [likelihood][impact] = risk score
  // Based on your provided grid
  matrix: {
    6: { 1: 17, 2: 19, 3: 26, 4: 28, 5: 34, 6: 36 }, // Almost Certain
    5: { 1: 10, 2: 18, 3: 21, 4: 27, 5: 30, 6: 35 }, // Likely
    4: { 1: 9,  2: 12, 3: 20, 4: 23, 5: 29, 6: 33 }, // Possible
    3: { 1: 3,  2: 11, 3: 13, 4: 22, 5: 24, 6: 32 }, // Unlikely
    2: { 1: 2,  2: 5,  3: 7,  4: 14, 5: 16, 6: 31 }, // Very Unlikely
    1: { 1: 1,  2: 4,  3: 6,  4: 8,  5: 15, 6: 25 }  // Rare
  },
  
  // Risk level mapping based on score ranges
  // Extreme: 31-36, High: 24-30, Medium: 13-23, Minor: 5-12, Sustainable: 1-4
  getRiskLevel: function(score) {
    if (score >= 31) return 'Extreme';
    if (score >= 24) return 'High';
    if (score >= 13) return 'Medium';
    if (score >= 5) return 'Minor';
    return 'Sustainable';
  },
  
  // Calculate risk using the lookup table
  calculateRisk: function(likelihood, impact) {
    const likelihoodValue = this.likelihood[likelihood] || 3;
    const impactValue = this.impact[impact] || 3;
    
    const score = this.matrix[likelihoodValue][impactValue];
    return this.getRiskLevel(score);
  }
};

module.exports = riskMatrix;