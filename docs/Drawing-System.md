# AI Threat Modeler - Drawing Layer System

## Table of Contents
1. [Overview](#overview)
2. [Drawing Types](#drawing-types)
3. [Tool System](#tool-system)
4. [Visual Design](#visual-design)
5. [State Management](#state-management)
6. [User Interaction](#user-interaction)
7. [Technical Implementation](#technical-implementation)
8. [Integration](#integration)
9. [Animation System](#animation-system)
10. [Performance Considerations](#performance-considerations)

## Overview

The Drawing Layer System provides a flexible annotation and boundary marking capability that overlays the main diagram editor. This system allows users to create visual annotations, mark system boundaries, and add context to their threat model diagrams through free-form drawing tools.

### Core Features
- **Free-form Drawing**: Smooth drawing capabilities with mouse input
- **Boundary Marking**: Dashed boundary boxes for system delineation
- **Annotation Tools**: Freehand annotations for highlighting areas
- **Selection System**: Click-based selection and deletion of drawings
- **Keyboard Shortcuts**: Quick tool switching and actions
- **Zoom Synchronization**: Drawing coordinates adapt to viewport zoom
- **Persistence**: Drawings saved with diagram data

## Drawing Types

### Type Definitions

```typescript
type DrawingTool = 'select' | 'boundary' | 'annotation' | 'text';

interface Drawing {
  id: string;                    // Unique identifier
  path: string;                  // SVG path data
  type: 'boundary' | 'annotation'; // Drawing category
  style: {
    stroke: string;              // Color value
    strokeWidth: number;         // Line thickness
    strokeDasharray?: string;    // Dash pattern for boundaries
    opacity: number;             // Transparency level
  };
  bounds?: {                     // Bounding box for optimization
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

### Drawing Categories

#### 1. Boundary Drawings
**Purpose**: Mark system boundaries, trust zones, and architectural divisions

**Visual Characteristics**:
- Dashed stroke pattern (5,5)
- Blue color (#1565C0)
- Medium thickness (2px)
- Semi-transparent (0.8 opacity)

**Use Cases**:
- System boundary delineation
- Network segment marking
- Security zone highlighting
- Compliance scope definition

#### 2. Annotation Drawings
**Purpose**: Free-form annotations for highlighting and emphasis

**Visual Characteristics**:
- Solid stroke
- Orange color (#E65100)
- Thinner line (1.5px)
- Higher opacity (0.9)

**Use Cases**:
- Risk area highlighting
- Important component marking
- Flow path tracing
- General annotations

#### 3. Text Annotations (Planned)
**Purpose**: Textual labels and descriptions

**Planned Features**:
- Rich text support
- Font size/color customization
- Background highlighting
- Arrow connections

## Tool System

### Tool Types

#### Select Tool (Hotkey: V)
**Functionality**:
- Select existing drawings
- Move drawings (planned)
- Multi-select support (planned)
- Bounding box display

**Interaction**:
- Click to select drawing
- Shift+click for multi-select
- ESC to clear selection

#### Boundary Tool (Hotkey: B)
**Functionality**:
- Create system boundary markers
- Rectangular drawing mode
- Snap-to-grid (optional)

**Drawing Process**:
1. Click and drag to create boundary
2. Release to complete drawing
3. Automatic style application

#### Annotation Tool (Hotkey: A)
**Functionality**:
- Free-form drawing
- Smooth path generation
- Pressure sensitivity (future)

**Drawing Process**:
1. Click to start path
2. Drag to continue drawing
3. Release to complete annotation

#### Delete Tool (Hotkey: Del)
**Functionality**:
- Remove selected drawings
- Confirmation dialogs (optional)
- Undo support

## Edit Mode System

### Overview

The Edit Drawings mode is a toggle that controls whether drawing nodes can be selected and edited. This design ensures drawing nodes don't interfere with security node interactions during normal use.

### Mode States

#### Normal Mode (Edit Drawings OFF)
- Drawing nodes are completely non-interactive
- Clicks pass through to security nodes below
- Drawing nodes cannot be selected, moved, or edited
- NodeResizer handles are hidden
- Text annotations cannot be edited

#### Edit Mode (Edit Drawings ON)
- Drawing nodes become selectable
- Can move and resize drawing nodes
- Text annotations editable on double-click
- NodeResizer handles visible when selected
- Delete selected button becomes active

### Implementation

```typescript
// In DrawingLayerComponent
const [isDrawingEditMode, setIsDrawingEditMode] = useState(false);

// Toggle button in toolbar
<ToggleButton
  value="edit"
  selected={isDrawingEditMode}
  onChange={() => setIsDrawingEditMode(!isDrawingEditMode)}
>
  <Edit className="icon" />
  <span>Edit Drawings</span>
</ToggleButton>
```

## Visual Design

### Node Visual States

#### Non-Edit Mode
- Drawing nodes have `pointer-events: none`
- No hover effects
- Cannot be selected
- Appear as static visual elements

#### Edit Mode - Unselected
- `pointer-events: auto`
- Hover cursor changes to pointer
- Can be clicked to select

#### Edit Mode - Selected
- NodeResizer handles visible
- Can be moved with drag
- Can be resized (maintains aspect ratio for circles)
- Text annotations show text cursor on hover

### CSS Classes

```css
/* Applied to React Flow nodes when not in edit mode */
.react-flow__node.non-selectable-drawing {
  pointer-events: none !important;
  cursor: default !important;
}

/* Drawing node specific styles */
.drawing-node-freehand,
.drawing-node-shape,
.drawing-node-text {
  user-select: none;
}
```

## State Management

### Drawing State Structure

```typescript
interface DrawingState {
  drawings: Drawing[];           // All drawings in the diagram
  selectedDrawingIds: string[];  // Currently selected drawings
  currentTool: DrawingTool;      // Active drawing tool
  isDrawing: boolean;           // Drawing in progress flag
  currentPath: string;          // Path being drawn
  tempDrawing: Drawing | null;  // Temporary drawing preview
}
```

### State Actions

```typescript
type DrawingAction = 
  | { type: 'SET_TOOL'; tool: DrawingTool }
  | { type: 'START_DRAWING'; point: Point }
  | { type: 'CONTINUE_DRAWING'; point: Point }
  | { type: 'FINISH_DRAWING'; drawing: Drawing }
  | { type: 'SELECT_DRAWING'; id: string; multiSelect?: boolean }
  | { type: 'DELETE_SELECTED' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'LOAD_DRAWINGS'; drawings: Drawing[] };
```

### Context Integration

The drawing state is managed within the AnalysisContext to ensure:
- Persistence across diagram saves
- Inclusion in AI analysis context
- Real-time updates during drawing operations
- Synchronization with diagram changes

```typescript
interface AnalysisContextState {
  // ... other state
  drawings: Drawing[];
  drawingState: DrawingState;
}
```

## User Interaction

### Mouse Interactions

#### Drawing Process
1. **Tool Selection**: Click tool button or use hotkey
2. **Start Drawing**: Mouse down on canvas
3. **Path Creation**: Mouse move with button down
4. **Complete Drawing**: Mouse up
5. **Auto-save**: Drawing added to state

#### Selection Process
1. **Select Tool**: Activate select tool (V)
2. **Click Drawing**: Select single drawing
3. **Multi-select**: Shift+click for multiple
4. **Clear Selection**: Click empty area or ESC

### Keyboard Shortcuts

```typescript
const HOTKEYS = {
  'KeyV': 'select',              // Select tool
  'KeyB': 'boundary',            // Boundary tool
  'KeyA': 'annotation',          // Annotation tool
  'Delete': 'delete',            // Delete selected
  'Backspace': 'delete',         // Delete selected (Mac)
  'Escape': 'clearSelection'     // Clear selection
};
```

### Touch Support (Future)

Planned touch interactions:
- Single finger drawing
- Two-finger pan/zoom
- Long press for selection
- Touch-specific UI adjustments

## Technical Implementation

### Component Architecture

#### DrawingLayerComponent
```typescript
interface DrawingLayerProps {
  drawings: Drawing[];
  selectedIds: string[];
  currentTool: DrawingTool;
  onDrawingAdd: (drawing: Drawing) => void;
  onDrawingUpdate: (id: string, drawing: Drawing) => void;
  onDrawingRemove: (id: string) => void;
  onSelectionChange: (ids: string[]) => void;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
}

const DrawingLayerComponent: React.FC<DrawingLayerProps> = ({
  drawings,
  selectedIds,
  currentTool,
  onDrawingAdd,
  onDrawingUpdate,
  onDrawingRemove,
  onSelectionChange,
  viewport
}) => {
  // Component implementation
};
```

### SVG Rendering

```typescript
const renderDrawing = (drawing: Drawing, isSelected: boolean) => {
  const style = {
    ...DRAWING_STYLES[drawing.type.toUpperCase()],
    ...(isSelected ? DRAWING_STYLES.SELECTED : {})
  };

  return (
    <path
      key={drawing.id}
      d={drawing.path}
      style={style}
      onClick={() => handleDrawingClick(drawing.id)}
      className={`drawing-${drawing.type} ${isSelected ? 'selected' : ''}`}
    />
  );
};
```

### Path Generation

```typescript
class PathBuilder {
  private points: Point[] = [];
  
  addPoint(point: Point): void {
    this.points.push(point);
  }
  
  generateSmoothPath(): string {
    if (this.points.length < 2) return '';
    
    let path = `M ${this.points[0].x} ${this.points[0].y}`;
    
    for (let i = 1; i < this.points.length; i++) {
      const prev = this.points[i - 1];
      const curr = this.points[i];
      
      // Smooth curve generation
      const cp1x = prev.x + (curr.x - prev.x) * 0.5;
      const cp1y = prev.y;
      const cp2x = curr.x - (curr.x - prev.x) * 0.5;
      const cp2y = curr.y;
      
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
    }
    
    return path;
  }
}
```

## Integration

### Diagram Editor Integration

#### Z-Index Layering
```css
.diagram-editor {
  position: relative;
}

.reactflow-wrapper {
  z-index: 1;
}

.drawing-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  pointer-events: none;
}

.drawing-layer.active {
  pointer-events: all;
}
```

#### Coordinate Synchronization
```typescript
const transformPoint = (point: Point, viewport: Viewport): Point => {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom
  };
};

const inverseTransformPoint = (point: Point, viewport: Viewport): Point => {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y
  };
};
```

### Save/Load Integration

#### Data Serialization
```typescript
interface SavedDiagramData {
  nodes: SecurityNode[];
  edges: SecurityEdge[];
  metadata: {
    version: string;
    created: string;
    drawings: Drawing[];  // Drawings included in save data
  };
}
```

#### Loading Process
```typescript
const loadDiagram = (data: SavedDiagramData) => {
  // Load nodes and edges
  setNodes(data.nodes);
  setEdges(data.edges);
  
  // Load drawings if present
  if (data.metadata.drawings) {
    setDrawings(data.metadata.drawings);
  }
};
```

### AI Analysis Integration

Drawings are included in the AI analysis context:

```typescript
const buildAnalysisContext = (diagram: DiagramData, drawings: Drawing[]) => {
  return {
    diagram,
    annotations: {
      drawings: drawings.map(drawing => ({
        type: drawing.type,
        bounds: drawing.bounds,
        description: generateDrawingDescription(drawing)
      })),
      boundaryCount: drawings.filter(d => d.type === 'boundary').length,
      annotationCount: drawings.filter(d => d.type === 'annotation').length
    }
  };
};
```

## Animation System

### Transition Effects

```css
/* Base drawing animations */
.drawing-element {
  transition: stroke 0.2s ease,
              stroke-width 0.2s ease,
              opacity 0.2s ease,
              filter 0.2s ease;
}

/* Selection animations */
.drawing-selected {
  animation: selectionPulse 2s ease-in-out infinite alternate;
}

@keyframes selectionPulse {
  from { filter: brightness(120%) drop-shadow(0 0 4px rgba(255, 64, 129, 0.3)); }
  to   { filter: brightness(130%) drop-shadow(0 0 6px rgba(255, 64, 129, 0.7)); }
}

/* Tool transition */
.drawing-layer.tool-transition {
  transition: cursor 0.1s ease;
}
```

### Dynamic Feedback

```typescript
const getDrawingStyle = (drawing: Drawing, state: DrawingState) => {
  const base = DRAWING_STYLES[drawing.type.toUpperCase()];
  const isSelected = state.selectedDrawingIds.includes(drawing.id);
  const isHovered = state.hoveredDrawingId === drawing.id;
  
  return {
    ...base,
    ...(isSelected && DRAWING_STYLES.SELECTED),
    ...(isHovered && { filter: 'brightness(110%)' })
  };
};
```

## Performance Considerations

### Optimization Strategies

#### 1. Viewport Culling
```typescript
const getVisibleDrawings = (drawings: Drawing[], viewport: Viewport) => {
  return drawings.filter(drawing => {
    if (!drawing.bounds) return true; // Include if no bounds data
    
    return rectanglesIntersect(drawing.bounds, viewport.visibleArea);
  });
};
```

#### 2. Path Simplification
```typescript
const simplifyPath = (points: Point[], tolerance: number = 2): Point[] => {
  if (points.length <= 2) return points;
  
  // Douglas-Peucker algorithm implementation
  return douglasPeucker(points, tolerance);
};
```

#### 3. Debounced Updates
```typescript
const debouncedPathUpdate = useCallback(
  debounce((path: string) => {
    setCurrentPath(path);
  }, 16), // ~60fps
  []
);
```

#### 4. Memory Management
```typescript
const cleanupPaths = (drawings: Drawing[]) => {
  // Remove drawings outside visible area after timeout
  // Compress path data for storage
  // Limit maximum number of drawings
};
```

### Hardware Acceleration

```css
.drawing-layer {
  transform: translateZ(0); /* Force GPU layer */
  will-change: transform;
}

.drawing-element {
  vector-effect: non-scaling-stroke; /* Optimize stroke rendering */
}
```

## Future Enhancements

### Planned Features

1. **Text Annotations**
   - Rich text support
   - Font customization
   - Background highlighting

2. **Advanced Drawing Tools**
   - Shape tools (rectangle, circle, arrow)
   - Line tools (straight, curved)
   - Connector tools

3. **Drawing Styles**
   - Custom color palettes
   - Line style options
   - Transparency controls

4. **Collaboration Features**
   - Real-time drawing sync
   - Drawing attribution
   - Comment system

5. **Export Options**
   - SVG export
   - PNG rasterization
   - PDF integration

### Technical Improvements

1. **Performance**
   - WebGL rendering
   - Spatial indexing
   - Progressive loading

2. **Accessibility**
   - Screen reader support
   - Keyboard navigation
   - High contrast mode

3. **Mobile Support**
   - Touch optimization
   - Gesture recognition
   - Responsive UI

## Conclusion

The Drawing Layer System provides a powerful annotation capability that enhances the threat modeling experience. By integrating seamlessly with the diagram editor and maintaining performance through optimization strategies, it offers users the flexibility to add visual context to their security analyses while preserving the technical rigor of the underlying threat model.