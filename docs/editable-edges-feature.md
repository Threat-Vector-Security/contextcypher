# Editable Edges Feature Implementation

## Overview
This document describes the implementation of editable edges with control points in the AI Threat Modeler application.

## Features Implemented

### 1. Control Points
- Edges can have draggable control points for rerouting
- Control points appear when an edge or its connected nodes are selected
- Two default control points are created on either side of the edge label
- Control points can be deleted by right-clicking or pressing Delete/Backspace
- Control points can be moved with keyboard arrows for precise positioning

### 2. Data Structure
Added `controlPoints` field to `SecurityEdgeData` interface:
```typescript
export interface ControlPointData {
  id: string;
  x: number;
  y: number;
  active?: boolean;
}

export interface SecurityEdgeData {
  // ... existing fields
  controlPoints?: ControlPointData[];
}
```

### 3. Components Created

#### ControlPoint Component (`/src/components/edges/ControlPoint.tsx`)
- Renders individual control points
- Handles drag interactions
- Supports keyboard navigation
- Visual feedback on hover/drag

#### EditableSecurityEdge Component (`/src/components/edges/EditableSecurityEdge.tsx`)
- Enhanced version of SecurityEdge with control point support
- Manages control point state
- Renders smooth curves through control points
- Preserves all existing SecurityEdge functionality

#### Edge Path Utilities (`/src/components/edges/edgePathUtils.ts`)
- `getSmoothPath`: Calculates smooth Bezier curves through control points
- `calculateInitialControlPoints`: Creates default control points
- `getLabelPosition`: Calculates label position along curved paths
- `getPathPoints`: Converts control points to path coordinates

### 4. User Interactions

#### Adding Control Points
- Click on an edge to select it
- Control points automatically appear when edge is selected
- Initial control points are positioned optimally for edge rerouting

#### Moving Control Points
- Click and drag control points to new positions
- Use arrow keys for fine-tuned positioning (5px increments)
- Visual feedback during drag operations

#### Deleting Control Points
- Right-click on a control point to delete it
- Press Delete or Backspace when control point is focused
- Edge returns to straight line when all control points are removed

### 5. Persistence
- Control point positions are saved as part of the edge data
- Control points are restored when diagrams are loaded
- Compatible with existing save/load functionality
- When an edge has no control points (fresh or cleared), it renders as a smooth-step path.
- As soon as a control point is added, the edge switches to the custom routed path automatically.

## Technical Details

### Path Rendering
- Default routing uses React Flow smooth-step paths when no control points are defined.
- Adding a control point switches the edge to custom routing immediately.
- If control points exist, edges render through those points using linear or bezier paths.
- Maintains proper arrow positioning at edge endpoints.

### Performance Optimizations
- Memoized path calculations
- Efficient update handling through React Flow's edge update mechanism
- Minimal re-renders using React.memo and useMemo

### Styling
- Control points match edge color scheme
- Hover and active states for better UX
- Larger invisible hit areas for easier interaction

## Usage Example

1. Create edges between nodes normally
2. Click on an edge to select it
3. Two control points appear on either side of the label
4. Drag control points to reroute the edge
5. Right-click control points to remove them
6. Save diagram - control points are preserved

## Future Enhancements

- Add control point along edge path on double-click
- Support for more complex curve types
- Snap-to-grid for control points
- Copy/paste edge routing patterns
