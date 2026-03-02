# AI Threat Modeler - Frontend Architecture & Component Overview

## Table of Contents
1. [Overview](#overview)
2. [Core Architecture](#core-architecture)
3. [Responsive Layout System](#responsive-layout-system)
4. [Component Hierarchy](#component-hierarchy)
5. [Main Components](#main-components)
6. [Data Flow](#data-flow)
7. [Visual Components](#visual-components)
8. [Interaction System](#interaction-system)
9. [State Management](#state-management)
10. [Performance Optimizations](#performance-optimizations)

## Overview

The AI Threat Modeler frontend is a sophisticated React-based diagramming application built on ReactFlow. It provides a visual interface for creating security architecture diagrams with AI-powered threat analysis capabilities. The frontend architecture emphasizes performance, user experience, and seamless integration with AI services.

### Key Technologies
- **React 18.x** with TypeScript for type safety
- **ReactFlow 11.11.4** for diagram rendering and interaction
- **Material-UI (MUI)** for consistent UI components
- **Modern Web Browsers** with Web Crypto API and File System Access API support
- **Custom security-focused components** for threat modeling

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DiagramEditor                            │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │  Toolbar   │  │  ReactFlow  │  │  Analysis Panel    │  │
│  │            │  │  Canvas     │  │                    │  │
│  └────────────┘  │             │  └────────────────────┘  │
│  ┌────────────┐  │ ┌─────────┐ │  ┌────────────────────┐  │
│  │   Node     │  │ │ Nodes   │ │  │  Custom Context    │  │
│  │  Toolbox   │  │ │ & Edges │ │  │     Panel          │  │
│  └────────────┘  │ └─────────┘ │  └────────────────────┘  │
│                  │ ┌─────────┐ │                           │
│                  │ │ Zones   │ │                           │
│                  │ └─────────┘ │                           │
│                  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### App Shell Module Architecture (Diagram + GRC)

`src/App.tsx` owns cross-module runtime state and controls which major surface is active:

- `activeModule: 'diagram' | 'grc'`
- `grcWorkspace` (authoritative GRC data model)
- `diagramSnapshotRef` + `diagramSnapshot` (latest diagram context handed to GRC)
- `grcUiNavigationState` (GRC tab/detail navigation restoration)

Rendering behavior is intentionally asymmetric for performance:

- `DiagramEditor` stays mounted and is visibility-toggled (`display: block/none`) so diagram interaction state is preserved.
- `GrcModule` is conditionally mounted only when active (`activeModule === 'grc'`) to eliminate hidden GRC render overhead while working in Diagram mode.

To prevent data loss while still unmounting GRC:

- data edits persist in `grcWorkspace` at App level
- view-position state persists in `grcUiNavigationState` (active GRC tab, selected assessment, expanded rows, etc.)
- on remount, `GrcModule` restores tab and per-tab view state through `getTabViewState(...)` / `setTabViewState(...)`

## Responsive Layout System

The frontend uses a centralized responsive layout system so behavior is consistent across desktop, tablet, and touch phones.

### Core Layout Engine

- `src/hooks/useViewportLayout.ts` is the single source of truth for viewport-driven UI behavior.
- `src/styles/layout.ts` defines breakpoint tiers, panel presentation rules, responsive panel widths, and shared shell dimensions.
- `DiagramEditor.tsx` consumes this layout state and applies it to toolbar density, panel behavior, and interaction affordances.

### Breakpoint Tiers

Viewport tiering is width-based:

- `xs`: `< 600px`
- `sm`: `600px - 899px`
- `md`: `900px - 1199px`
- `lg`: `>= 1200px`

Toolbar density is:

- `full` on `lg`
- `compact` on `xs/sm/md`

### Panel Presentation Rules

Panel mode is derived from tier:

- `lg`: toolbox and analysis are `docked`
- `md`: toolbox is `docked`, analysis is `overlay`
- `xs/sm`: toolbox and analysis are `fullscreen`

Responsive widths are computed via `getResponsivePanelWidths()` and used consistently by panel containers and floating editors.

### Small Touch Behavior

For touch-first layouts, the app applies additional compact behavior:

- compact menu-first top bar
- panel overlays and fullscreen drawers where appropriate
- drawing toolbar rendered as a bottom horizontal control strip
- side vertical panel toggles hidden on small-touch layouts
- gesture-safe canvas defaults:
  - one-finger drag pans canvas
  - two-finger pinch zooms canvas
  - multiselect on touch is explicit mode (`Select` toggle), not implicit drag-lasso

The implementation also treats short-height `md` viewports (for example phone landscape) as small-touch UI to avoid desktop-style side controls colliding with compact controls.

### Key Responsive Integration Points

- `src/hooks/useViewportLayout.ts`: viewport state and layout model
- `src/styles/layout.ts`: tier thresholds and sizing rules
- `src/components/DiagramEditor.tsx`: app shell, compact menu, panel docking/overlay/fullscreen logic
- `src/components/grc/GrcModule.tsx`: GRC shell now uses the same tier-driven analysis panel behavior (docked `lg`, overlay `md`, fullscreen `xs/sm`), compact top controls, and mobile-safe tab navigation
- `src/components/DiagramEditorInner.tsx`: ReactFlow interaction configuration (`selectionOnDrag`, `panOnDrag`, pinch zoom behavior)
- `src/components/DrawingLayerComponent.tsx`: touch/phone toolbar placement and orientation
- `src/components/NodeToolbox.tsx` and `src/components/AnalysisPanel.tsx`: mobile scroll and panel ergonomics

### Maintenance Guidance

- Keep all new responsive behavior tier-driven via `useViewportLayout()` instead of ad-hoc media checks.
- When changing panel behavior, update `src/styles/layout.ts` first, then consume new behavior in container components.
- Validate both portrait and landscape on mobile devices and simulator profiles, especially for `md` short-height cases.

## Component Hierarchy

### 1. DiagramEditor (Main Container)
The `DiagramEditor.tsx` component serves as the main orchestrator for the entire diagramming interface.

**Key Responsibilities:**
- Manages global diagram state (nodes, edges, zones)
- Handles file operations (save, load, autosave)
- Coordinates between different UI panels
- Manages keyboard shortcuts and navigation
- Integrates with AI analysis services
- Manages floating window system for editors
- Integrates with AI diagram generation service

**Core Features:**
- **Autosave System**: Configurable interval-based saving with visual countdown
- **WASD Navigation**: Smooth viewport panning with acceleration
- **Snap-to-Grid**: Optional 50px grid alignment for precise layouts
- **Multi-panel Layout**: Collapsible toolbox and analysis panels
- **Real-time Context Tracking**: Monitors diagram changes for AI analysis
- **Floating Window Management**: Draggable, resizable editor windows
- **Quick Inspector**: Contextual property viewer on hover
- **Enhanced Double-click**: Opens editors in floating windows

### 2. Security Nodes System

#### SecurityNodes.tsx
A factory system that generates 150+ specialized security node components dynamically.

**Architecture:**
```typescript
// Dynamic node generation
const nodeTypeConfig: Record<string, { icon: React.ElementType, color: keyof typeof colors }> = {
  server: { icon: materialIconMappings.server.icon, color: 'serverColor' },
  firewall: { icon: materialIconMappings.firewall.icon, color: 'firewallColor' },
  // ... 150+ node types
};

// Automatic component generation
const NodeComponents: Record<string, React.FC<SecurityNodeProps>> = {};
```

**Node Categories:**
- **Infrastructure**: Servers, routers, firewalls, switches
- **Security Operations**: SIEM, SOAR, XDR, EDR
- **Cloud Security**: CASB, SASE, ZTNA
- **Data Protection**: DLP, DAM, PAM, HSM
- **Identity & Access**: MFA, SSO, LDAP
- **AI/ML**: AI Gateway, Model Registry, Vector Database
- **OT/SCADA**: PLC, HMI, RTU, Industrial components
- **Application Security**: API Gateway, WAF, Bot Protection

**Node Features:**
- **Visual Identity**: Each node type has unique icon and color
- **Handle System**: Bidirectional handles equally spaced on all four sides, positioned outside the node bounds
- **Security Metadata**: Zone assignment, security level, data classification
- **Dynamic Styling**: Theme-aware colors with dark/light mode support
- **Performance**: Memoized rendering with custom comparison functions

### 3. Security Edges

#### SecurityEdge.tsx & EditableSecurityEdge.tsx
Handles all connections between nodes with security-aware styling and metadata.

**Key Features:**
- **Zone-based Coloring**: Edges inherit colors from security zones
- **Multi-edge Support**: Handles multiple connections between same nodes
- **Smooth-Step Defaults**: Auto-routed smooth-step paths when no control points exist
- **Bezier/Linear Routing**: Custom paths through user-defined control points
- **Animated Flow**: Visual flow indicators for selected connections
- **Smart Labels**: Auto-positioned labels with edge metadata
- **Editable Control Points**: Draggable control points for custom edge routing

**EditableSecurityEdge Component:**
- **Smooth-Step Default**: Clean orthogonal routing until a control point is added
- **Manual Override**: Adding control points switches to custom routing instantly
- **Dynamic Label Positioning**: Label follows the active path
- **Multi-select Awareness**: Control points hidden when multiple nodes selected
- **Curved Hit Detection**: Invisible path follows actual curve for accurate selection

**Technical Implementation:**
```typescript
// Control point visibility based on selection state
const shouldShowControlPoint = useStore((store) => {
  if (!selected) return false;
  
  // Count selected nodes
  let selectedNodeCount = 0;
  store.nodeLookup.forEach((node) => {
    if (node.selected) selectedNodeCount++;
  });
  
  // Hide control points if multiple nodes are selected
  return selectedNodeCount <= 1;
});

// Smooth-step path when no control points exist
const [edgePath] = getSmoothStepPath({
  sourceX,
  sourceY,
  targetX,
  targetY
});
```

### 4. Security Zones

#### SecurityZoneNode.tsx
Special container nodes that represent security boundaries and network segments.

**Zone Types:**
- Internet, External, DMZ, Internal, Trusted
- Restricted, Critical, OT, Development, Staging
- Production, Cloud, Guest, Compliance

**Features:**
- **Resizable Containers**: Min 300x200px with visual resize handles
- **Z-index Management**: Zones render behind regular nodes
- **Selection System**: Special button for zone selection/editing
- **Visual Hierarchy**: Semi-transparent backgrounds with colored borders
- **Performance**: Optimized rendering with `contain: strict` CSS

### 5. Window Management System (New)

#### WindowManager.tsx & WindowManagerContext.tsx
A sophisticated floating window system for managing multiple editors simultaneously.

**Key Features:**
- **Multi-window Support**: Open multiple node/edge editors concurrently
- **Window States**: Minimize, maximize, restore, and close controls
- **Drag & Drop**: Draggable windows with smooth movement
- **Resize**: CSS-based resizing with min/max constraints
- **Focus Management**: Active window highlighting and z-index layering
- **Smart Positioning**: Cascading window placement for new windows
- **Singleton Windows**: Prevents duplicate windows for same content

**Technical Implementation:**
```typescript
// Window state management
interface WindowState {
  id: string;
  type: 'node' | 'edge' | 'inspector';
  title: string;
  content: any;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
}
```

### 7. DiagramEditorInner Component

#### DiagramEditorInner.tsx
A specialized wrapper component that ensures React Flow hooks are called within the proper context.

**Purpose:**
- Provides React Flow context for hooks like useUndoRedo
- Exposes undo/redo functionality via forwardRef
- Handles all ReactFlow event callbacks with proper snapshots

**Architecture:**
```typescript
export interface DiagramEditorInnerHandle {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  takeSnapshot: () => void;
}

// Component uses forwardRef to expose methods to parent
export const DiagramEditorInner = forwardRef<DiagramEditorInnerHandle, DiagramEditorInnerProps>((props, ref) => {
  const { canUndo, canRedo, undo, redo, takeSnapshot } = useUndoRedo({
    maxHistorySize: 100,
    enableShortcuts: true
  });
  
  useImperativeHandle(ref, () => ({
    undo, redo, canUndo, canRedo, takeSnapshot
  }), [undo, redo, canUndo, canRedo, takeSnapshot]);
  
  // Renders ReactFlow with all props and event handlers
});
```

This component pattern ensures:
- React Flow store access is available
- Hooks have proper context access
- Parent components can control undo/redo
- Clean separation of concerns

**Production Build Considerations:**
- ReactFlow's internal state management (Zustand) can behave differently in production builds
- The `useStoreApi` hook may return undefined during initialization
- Parent components must handle potential timing issues with try-catch blocks
- See [Production Build Issues](#production-build-issues) for details

### 8. Quick Inspector

#### QuickInspector.tsx
A lightweight, contextual property viewer that appears on element hover.

**Features:**
- **Hover Activation**: Shows on mouse hover after delay
- **Smart Positioning**: Auto-adjusts to stay within viewport
- **Comprehensive Info**: Displays all node/edge properties
- **Threat Indicators**: Warning icon badges for identified threats (no box outline)
- **Quick Actions**: Direct link to open full editor
- **Performance**: Minimal re-renders with effect-based updates
- **Authoritative Index Codes**: Reads `item.data.indexCode` directly – these codes are
  injected by the back-end `DiagramIndexer`, so the inspector always shows the exact same
  identifiers that ContextCypher and the diagram legend use.
- **Control Point Exclusion**: Automatically closes when edge control points are clicked
- **Positioning Adjustment**: Moved 100px right to avoid interference with control points

**Displayed Information:**
- Node/Edge type and ID
- Security properties (zone, level, classification)
- Product details (vendor, version, technology)
- Network configuration (protocols, ports, encryption)
- Security controls and compliance status
- Custom metadata fields

## Data Flow

### 0. AI Chat Pipeline (ContextCypher)

```
User Message → AnalysisContextProvider → AIRequestService → /api/chat (Node backend)
                ↑                       ↓
    Local messageHistory compaction   Formatted prompt (ContextCypher)
```

Key steps:
1. **AnalysisContextProvider** assembles a rich `analysisContext` object:
   • diagram (as raw nodes/edges)  → converted to compact Cypher.
   • customContext, drawings, diff log, identified threats.
   • recent **messageHistory** – optionally compressed by `MessageCompactionService` (front-end call) when the local window is >80 % full.

2. **AIRequestService** sends the object to `/api/chat` for both local and cloud models; there is no direct Ollama call anymore.

3. The backend injects the following prompt structure before passing it to the LLM:
   1) ContextCypher system header
   2) SYSTEM_OVERVIEW (counts)
   3) TASK block + one-line orientation (nodes/edges/zones)
   4) ANSWER FORMAT block (4 sections)
   5) VISUAL DIAGRAM STRUCTURE (full Cypher)
   6) ADDITIONAL CONTEXT (custom notes, drawings, diff)
   7) Recent THREAT INTEL and HISTORY (compacted)

4. Streaming responses are returned token-by-token and displayed in the AnalysisPanel.

### 0.1. Ollama Status Feedback System (2025-08)

The system provides real-time status updates when waiting for local LLM (Ollama) responses:

**Status Flow**:
```
User Message → Backend → Ollama Connection
     ↓            ↓
AnalysisPanel ← SSE Status Events ← Status Tokens
```

**Key Components**:

1. **Backend Status Generation** (`aiProviders.js`):
   - Sends status tokens through streaming interface: `[STATUS:CONNECTING_OLLAMA]`, `[STATUS:WAITING_FOR_MODEL]`, etc.
   - 3-minute timeout for Ollama requests with proper cleanup
   - Status updates at connection, waiting, and response phases

2. **SSE Status Events** (`index.js`):
   - Detects status tokens in the streaming pipeline
   - Converts to proper SSE events: `event: status\ndata: {"status": "...", "message": "..."}\n\n`
   - User-friendly messages like "Connecting to Ollama...", "Waiting for model to respond..."

3. **Frontend Status Handling**:
   - **AIRequestService**: Parses SSE status events and passes them as `[STATUS:type:message]` tokens
   - **AnalysisPanel**: Detects status tokens and displays them as temporary messages
   - Status messages are replaced with actual content once Ollama starts responding
   - Metadata tracking to differentiate status messages from actual responses

**User Experience**:
- Clear feedback when connecting to Ollama
- Visual indication that the model is loading/thinking
- Timeout messages if Ollama doesn't respond
- Seamless transition from status to actual response

This pipeline guarantees the user’s request is always within the first few hundred tokens, while the model still receives the complete diagram and context data further down in the same message.

### 1. Diagram State Management
```
User Action → DiagramEditor → ReactFlow → State Update → AI Context Update
                                ↓
                          Visual Update ← Re-render
```

### 2. AI Analysis Flow
```
Diagram State → AnalysisContext → AIRequestService → Backend API
                                         ↓
User Interface ← AnalysisPanel ← Formatted Response
```

### 2.1 AI Diagram Generation Flow (New)
```
User Description → GenerateDiagramButton → DiagramGenerationService
                           ↓
                  Select Generation Type
                           ↓
            generateDiagram() API call → /api/generate-diagram
                           ↓
                   Parse Cypher Response
                           ↓
              Create ExampleSystem → Apply to DiagramEditor
```

### 3. File Operations
```
Save: Diagram State → Serialization → File System API / Download
Load: File Selection → Deserialization → State Restoration → View Fit
```

## Visual Components

### Component Styling System

**Theme Integration:**
- Dynamic theme switching (light/dark/custom)
- Theme-aware node colors option
- Consistent color palette across all components

**Visual Hierarchy:**
1. **Zones** (z-index: -1 to 5): Background layer
2. **Edges** (z-index: 10-11): Connection layer
3. **Nodes** (z-index: 10): Component layer
4. **Handles** (z-index: 10): Interaction points
5. **UI Overlays** (z-index: 1000+): Panels and controls

### Animation System
- **CSS Transitions**: Smooth state changes (200ms default)
- **Edge Flow Animation**: Directional flow indicators with animated dashes
- **Selection Effects**: Scale transforms and glow effects (animations disabled to prevent flashing)
- **Panel Transitions**: Cubic-bezier easing for panel slides
- **Edge Selection Animation**: Connected edges animate when their source/target nodes are selected

**Multi-Select Animation Fix:**
To prevent rapid flashing during multi-select operations, conflicting animations have been disabled:
- Removed `pulse` animation from `.react-flow__node.selected` in ThemeAnimations.css
- Disabled `pulse-subtle` animation from `.modern-node.selected` in ModernStyles.css
- Modified NodeEffects.tsx to use static box-shadow instead of animated selection
- Added CSS rules to force disable animations during selection box drag operations
- Result: Stable visual feedback without performance-impacting animation loops

**Node Transform Fix:**
Fixed nodes piling on top of each other during selection:
- Added `will-change: transform` optimization in ModernStyles.css
- Restored proper `transform: scale(1.05)` for selected nodes
- Ensured transform styles are preserved during multi-select operations

**Edge Animation System:**
- Edges track connected node selection state via `sourceNodeSelected` and `targetNodeSelected` data properties
- Animation triggers when edge is directly selected OR when connected nodes are selected
- 10ms debounced updates to prevent excessive re-renders during selection changes
- Supports individual selection, Ctrl+click multi-select, and box selection

## Interaction System

### 1. Mouse Interactions
- **Drag & Drop**: Node creation from toolbox
- **Double-click**: Open node/edge editors
- **Selection**: Click to select, Shift for multi-select
- **Panning**: Middle mouse or two-finger drag
- **Zooming**: Scroll wheel with 0.1-4x range

### 2. Keyboard Shortcuts
- **WASD**: Viewport navigation with smooth acceleration
- **Delete/Backspace**: Remove selected elements
- **Shift**: Enable multi-selection mode
- **Escape**: Close editors/panels
- **Ctrl/Cmd+C**: Copy selected nodes and edges
- **Ctrl/Cmd+V**: Paste at mouse position
- **Ctrl/Cmd+X**: Cut selected nodes and edges
- **Ctrl/Cmd+Z**: Undo last action
- **Ctrl/Cmd+Y**: Redo last undone action (added support for Ctrl+Y in addition to Ctrl+Shift+Z)

### 3. Touch Support
- **Pinch-to-zoom**: Touch gesture support
- **Pan gestures**: Touch-based viewport movement

### 4. Copy-Paste System (Enhanced)
The application now features a robust copy-paste system that properly integrates with ReactFlow's selection mechanism.

**Key Features:**
- **Multi-select Support**: Works with both individual selection (Ctrl+click) and box selection
- **Clipboard Persistence**: Copied elements remain in clipboard even after deselection
- **Smart Edge Handling**: Only copies edges that connect selected nodes
- **Position-aware Paste**: Pastes at current mouse position or viewport center
- **Unique ID Generation**: Ensures no ID conflicts when pasting
- **Undo/Redo Integration**: Copy/paste operations are tracked in undo history
- **Global Clipboard**: Uses `window.__clipboardNodes` for cross-component sharing

**Implementation:**
- **useCopyPaste Hook**: Custom hook that manages clipboard state and operations
- **Dual Clipboard System**: Both local state and global window object for reliability
- **Mouse Position Tracking**: Real-time tracking via mousemove events for accurate paste positioning
- **Event Interception**: Keyboard events handled at both component and document level

**Architecture:**
- Clipboard data stored in both React state and window object
- Synchronization between edit menu operations and keyboard shortcuts
- Special handling for security zones (non-draggable by design)
- Cut operations marked with `window.__clipboardFromCut` flag

**Known Issues:**
- **Cut/Paste Multiselect Drag**: After cut/paste operation, pasted nodes appear selected but cannot be dragged as a group without first deselecting and reselecting them. This appears to be related to React Flow's internal multiselection state management when nodes are deleted and new ones added in quick succession. Copy/paste works correctly.

## State Management

### 1. Local State (Component Level)
- Node positions and selections
- Panel open/closed states
- Temporary UI states

### 2. App-Level Cross-Module State (`src/App.tsx`)
- `activeModule` controls Diagram vs GRC surface.
- `grcWorkspace` is the canonical GRC data store shared across module switches.
- `diagramSnapshotRef` captures live diagram context; `diagramSnapshot` is updated for GRC consumption when required.
- `grcUiNavigationState` stores lightweight GRC navigation context (active tab + per-tab detail focus), enabling GRC unmount/remount without losing user position.

### 3. Context Providers
- **AnalysisContext**: AI conversation and diagram tracking
- **SettingsContext**: User preferences and configuration with secure API key storage
- **Theme Context**: Visual theme management
- **License Context** (via useLicense hook): License state and feature access

### 4. Persistence
- **localStorage**: Settings and preferences (excluding API keys)
- **Web Crypto API**: Client-side encrypted API key storage in localStorage
- **File System**: Diagram saves with full state
- **Workspace payload**: `grcWorkspace` is serialized with diagram file save/open flow
- **Session runtime state**: `grcUiNavigationState` is intentionally in-memory only in this iteration
- **Autosave**: Periodic state persistence

## Performance Optimizations

### 1. React Optimizations
```typescript
// Memoized components
const NodeComponent = React.memo(({ data, selected }) => {
  // Component implementation
}, (prevProps, nextProps) => {
  // Custom comparison logic
  return prevProps.selected === nextProps.selected &&
         JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data);
});
```

### 2. Render Optimizations
- **Debounced Updates**: 250ms delay for position changes
- **RAF Scheduling**: RequestAnimationFrame for smooth updates
- **Viewport Culling**: ReactFlow only renders visible elements
- **CSS Containment**: `contain: strict` for layout isolation

### 3. Memory Management
- **Component Unmounting**: Proper cleanup in useEffect
- **Event Listener Cleanup**: Remove listeners on unmount
- **Memoized Calculations**: useMemo for expensive operations

## Integration Points

### 1. Backend Communication
- **AIRequestService**: Handles all AI provider communication
- **DiagramGenerationService**: Manages AI diagram generation with three modes
- **File Operations**: Browser File System Access API for saving/loading diagrams
- **Settings Sync**: Configuration persistence
- **API Layer**: New `generateDiagram()` function for dedicated endpoint

### 2. External Libraries
- **ReactFlow**: Core diagramming engine
- **Material-UI**: UI component library
- **Lucide React**: Icon system
- **React Colorful**: Color picker integration
- **Axios**: HTTP client with interceptors for authentication

### 3. Custom Services
- **DiagramSanitizer**: Security-focused data cleaning
- **IconSerialization**: Icon state persistence
- **ValidationService**: Diagram integrity checks
- **DiagramGenerationService**: AI-powered diagram creation with type-specific prompts
- **DiagramImportService**: Multi-format diagram import with intelligent type mapping
- **ConnectionManager**: Server health monitoring and auto-recovery
- **Port Detection**: Dynamic server port discovery (default 3002 in development)
- **SecureStorageService**: Military-grade encrypted API key storage using Web Crypto API with AES-GCM encryption
- **LicenseService**: License validation and feature access control

## Best Practices

### 1. Component Design
- Keep components focused and single-purpose
- Use TypeScript for type safety
- Implement proper error boundaries
- Follow React hooks best practices

### 2. Performance
- Minimize re-renders with proper memoization
- Use CSS transforms for animations
- Implement virtual scrolling for large lists
- Batch state updates when possible

### 3. Accessibility
- Keyboard navigation support
- ARIA labels for interactive elements
- Focus management for modals
- High contrast mode support

## Future Enhancements

### Planned Improvements
1. **Enhanced Collaboration**: Real-time multi-user editing
2. **Advanced Animations**: Node transition effects
3. **Custom Themes**: User-defined color schemes
4. **Plugin System**: Extensible node types
5. **Performance Monitoring**: Built-in profiling tools

### Technical Debt
1. **Code Splitting**: Lazy load heavy components
2. **Service Workers**: Offline diagram caching
3. **WebAssembly**: Performance-critical operations
4. **GraphQL Integration**: Optimized data fetching

## Recent UI/UX Enhancements

### Edge Control Point System
A sophisticated system for customizing edge routing through draggable control points.

**Key Components:**
1. **QuadraticEdge.tsx**: Main edge component with two control points
2. **controlPointEvents.ts**: Event emitter for coordinating interactions
3. **ControlPointData Interface**: Type-safe control point state management

**Features:**
- **Two Control Points**: Positioned on either side of edge label for intuitive manipulation
- **Smart Visibility**: Control points only show when edge is selected and no multi-select active
- **Default Curves**: All edges have subtle 20px curve offset by default
- **Persistent State**: Control point positions saved and loaded with diagram
- **Smooth Interactions**: Drag operations use pointer events for reliable tracking
- **QuickInspector Integration**: Prevents inspector interference during control point manipulation

**Technical Implementation:**
- Uses cubic Bezier curves for smooth edge paths
- Control points calculate positions at 1/3 and 2/3 along the edge
- Event system prevents conflicts with other UI elements
- Hit detection follows the actual curved path, not straight line

### FloatingPanel Component
A reusable floating panel component that powers the window management system.

**Features:**
- **Draggable Header**: Move windows by dragging the title bar
- **Resizable**: CSS resize with visual resize handle
- **Window Controls**: Minimize, maximize/restore, dock/undock, close
- **GPU Acceleration**: Uses transform3d for smooth dragging
- **Boundary Constraints**: Keeps windows within specified bounds
- **Theme Integration**: Consistent styling with dark/light modes

**Performance Optimizations:**
- Hardware acceleration with `translateZ(0)`
- Backface visibility hidden to prevent flicker
- Will-change CSS property for drag operations
- Transition disabling during drag for smooth movement

### Enhanced User Experience
1. **Contextual Interactions**:
   - Hover over any node/edge to see quick properties
   - Double-click to open full editor in floating window
   - Right-click for context menus (when available)

2. **Window Management**:
   - Open multiple editors simultaneously
   - Compare node properties side-by-side
   - Minimize windows to declutter workspace
   - Maximize for detailed editing

3. **Responsive Layout**:
   - Windows auto-adjust bounds when panels open/close
   - Smart positioning prevents off-screen windows
   - Cascading placement for new windows

### Icon-Only Compact Mode (New)
A new display mode that shows nodes as compact icons instead of traditional expanded shapes, improving diagram readability and reducing visual clutter.

#### IconOnlyNode Component
Located at `src/components/nodes/IconOnlyNode.tsx`, this component renders nodes in a minimalistic 48x48px format.

**Visual Structure:**
```
┌─────────────┐
│   [Icon]    │  48x48px icon wrapper
│             │
└─────────────┘
  Node Label     11px text below icon
  Index Code     10px text below label (if present)
```

**Key Features:**
1. **Compact Display**: 48x48px icon with centered Material-UI icon
2. **Dynamic Icon Mapping**: Uses node type to display correct icon from materialIconMappings
3. **Hover-Only Handles**: Connection handles only visible on hover or selection, centered on each side outside the icon
4. **Index Code Display**: Shows node's index code below the label when present
5. **Theme-Aware Styling**: Respects current theme colors and settings
6. **Edit Button**: Small edit icon appears on hover (top-left corner)
7. **Badge Display**: Shows code/ID as a badge (top-right corner) when available

**Technical Implementation:**
- Uses styled-components for performance and theme integration
- Memoized with React.memo for optimal re-rendering
- Tracks edge connections to show which handles are in use
- Handle visibility controlled by hover state, not connection state

**Current Issues/Limitations:**
1. **Handle Visibility**: Handles should only show on hover (currently always visible)
2. **Edge Reconnection**: When switching between modes, edges don't automatically reconnect to new handle positions
3. **Index Code Display**: Index codes not showing below labels as intended
4. **Icon Mapping**: All nodes showing the same icon instead of type-specific icons

#### Mode Switching
The display mode can be toggled through three UI locations:

1. **View Menu**: Dropdown menu with "Icon-Only Nodes" / "Expanded Nodes" option
2. **Canvas Toolbar**: Eye/EyeOff icon button for quick toggle
3. **Settings Drawer**: Appearance tab with dropdown selector

**Settings Persistence:**
- Mode preference saved in `AppSettings.nodeDisplayMode` ('icon' | 'expanded')
- Default mode is 'icon' for new users (set in defaultSettings.ts)
- Setting persists in browser localStorage

**Mode Change Behavior:**
- DiagramEditor dynamically switches nodeTypes mapping based on current mode
- All existing nodes on canvas immediately update to new display mode
- Edge reconnection handled by useEffect that forces edge recalculation:
  ```typescript
  // Force edge reconnection when display mode changes
  useEffect(() => {
    if (prevNodeDisplayMode.current !== settings.nodeDisplayMode && reactFlowInstance) {
      setEdges((currentEdges) => {
        return currentEdges.map(edge => ({
          ...edge,
          data: { ...edge.data, _forceUpdate: Date.now() }
        }));
      });

      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.1, duration: 200 });
      }, 100);
    }
  }, [settings.nodeDisplayMode, reactFlowInstance, setEdges]);
  ```

**Integration Points:**
- `DiagramEditor.tsx`: Contains mode switching logic and nodeTypes mapping
- `SettingsTypes.ts`: Defines nodeDisplayMode type in AppSettings interface
- `defaultSettings.ts`: Sets default mode to 'icon'
- `SettingsDrawer.tsx`: UI for mode selection in appearance settings

**Future Improvements:**
1. Fix handle visibility to properly hide when not hovering
2. Ensure edge reconnection works smoothly on mode switch
3. Display index codes below node labels
4. Correct icon mapping based on node type
5. Add transition animations for smooth mode switching
6. Consider different icon sizes for better visibility

## AI Diagram Generation Integration

### GenerateDiagramButton Component
Provides the interface for AI-powered diagram generation with three distinct modes.

**Features:**
- Generation type selector (Technical/Process/Hybrid)
- Character count validation (min 50, max 15,000)
- Real-time progress tracking
- Cost estimation based on description length
- Token usage optimization

### DiagramGenerationService
Orchestrates the entire generation pipeline from text to visual diagram.

**Key Operations:**
1. **API Communication**: Direct calls to `/api/generate-diagram` endpoint
2. **Cypher Parsing**: Converts AI response to diagram structure
   - Parses node creation with metadata (vendor, version, technology, protocols)
   - Handles variable name mappings for connections
   - Extracts instanceCount for grouped components
3. **Node Positioning**: Smart layout within security zones
4. **Connection Validation**: Ensures all nodes are properly connected
5. **Zone Management**: Dynamic sizing and overflow handling

**Generation Types:**
- **Technical**: Creates every component exactly as described
  - No grouping, exact representation
  - Includes all metadata from description
- **Process**: Groups similar components for workflow clarity
  - Target 30-50 nodes maximum
  - Uses instanceCount for quantities
- **Hybrid**: Balances accuracy with readability through smart grouping
  - Groups 3+ similar components
  - Preserves metadata for all nodes

**Cypher Parsing Details:**
```typescript
// Node parsing extracts metadata
components.push({
  id: props.id,
  name: props.label || props.id,
  type: props.type || nodeType.toLowerCase(),
  zone: props.zone as SecurityZone,
  description: props.description,
  vendor: props.vendor,
  version: props.version,
  technology: props.technology,
  protocols: props.protocols ? props.protocols.split(',') : [],
  securityControls: props.securityControls ? props.securityControls.split(',') : [],
  instanceCount: props.instanceCount ? parseInt(props.instanceCount) : undefined
});
```

### DiagramImportService (Enhanced with AI)
Comprehensive service for importing diagrams from various external formats with AI-powered conversion option.

**Supported Formats:**
- **Mermaid** (.mmd, .mermaid) - Flow diagrams and graph syntax
- **DrawIO/Diagrams.net** (.drawio, .xml) - XML-based vector diagrams
- **PlantUML** (.puml, .plantuml) - Text-based UML diagrams
- **Graphviz DOT** (.dot, .gv) - Graph description language
- **JSON** (.json) - Generic JSON or ContextCypher export format

**Key Features:**
1. **Format Detection**: Automatic detection based on file extension and content
2. **Smart Node Type Mapping**: 
   - Maps external node types to ContextCypher security node types
   - Validates against 150+ supported node types
   - Defaults to 'generic' for unknown types
3. **Security Zone Inference**: Automatically assigns security zones based on node names and types
4. **Metadata Preservation**: Maintains all node and edge properties during import
5. **Layout Generation**: Creates organized layouts for diagrams without position data
6. **Data Validation**: Comprehensive validation with warnings for disconnected nodes
7. **AI-Enhanced Import** (New): Optional AI-powered conversion for better understanding of complex diagrams

**Import Pipeline with AI Enhancement:**
```typescript
File Selection → Format Detection → Import Options Dialog (New)
                                           ↓
                              Choose Import Method:
                              /                    \
                    Local Processing          AI-Enhanced Processing
                          ↓                            ↓
              Parse to Intermediate         Show Privacy Consent Dialog
                          ↓                            ↓
                                          Send to /api/convert-diagram
                          ↓                            ↓
Validation ← Security Zones ← Node Type Mapping ← AI Response Parsing
    ↓
Import Confirmation Dialog → Save/Discard Current → Apply to DiagramEditor
```

**AI-Enhanced Import Features:**
1. **Privacy-First Approach**: 
   - Import Options Dialog presents two choices: Local (default) vs AI-Enhanced
   - Clear privacy notices about data transmission
   - Explicit user consent required for AI processing
   - Data sanitization option to remove sensitive information

2. **ImportOptionsDialog Component**:
   - Two-tier import approach with visual cards
   - Local processing card emphasizes privacy and no data transmission
   - AI processing card shows current provider and capabilities
   - Real-time data preview with sanitization
   - Collapsible privacy details section

3. **AI Conversion Endpoint**: 
   - Dedicated `/api/convert-diagram` endpoint (separated from threat analysis)
   - Accepts format, content, prompt, and provider parameters
   - Returns structured JSON diagram compatible with ContextCypher
   - Supports all configured AI providers (Ollama, OpenAI, Anthropic, Gemini)

4. **Data Sanitization**:
   - Optional sanitization removes company names, IP addresses, emails, URLs
   - Replaces identifiable information with generic placeholders
   - Preserves diagram structure while protecting sensitive data

**Node Type Validation:**
- Comprehensive validation against all SecurityTypes.ts node categories
- Intelligent type inference from labels and properties
- Warning system for unknown types with automatic fallback
- Support for 150+ node types across 11 categories (Infrastructure, Security, Cloud, AI, OT, etc.)
- AI-enhanced mapping can better understand context and suggest appropriate types

### Toolbar System Enhancement (New)
Modern dropdown menu system replacing traditional toolbar buttons.

**ToolbarMenu Component:**
A reusable dropdown menu component with advanced features:
- **Hierarchical Menus**: Support for nested submenus
- **Keyboard Shortcuts**: Display and handle keyboard accelerators
- **Visual Separators**: Divider support for menu organization
- **Icon Integration**: Lucide React icons for all menu items
- **Disabled States**: Context-aware menu item availability
- **Theme Integration**: Consistent styling with light/dark modes

**Menu Structure:**
1. **File Menu**:
   - Save (Ctrl+S) - Context-aware with file handle detection
   - Save As (Ctrl+Shift+S) - Always available
   - Open (Ctrl+O) - File system access
   - Import Diagram (Ctrl+I) - Multi-format import
   - Export submenu (PNG, SVG, PDF)

2. **Edit Menu**:
   - Undo/Redo (with disabled states)
   - Copy/Paste operations
   - Clear Diagram with confirmation

3. **View Menu**:
   - Zoom controls (In/Out/Fit)
   - Grid toggle
   - Minimap toggle

**Implementation Details:**
```typescript
// Union type for menu items supporting both actions and dividers
export type MenuItemConfig = 
  | {
      label: string;
      action: string;
      icon?: React.ReactNode;
      shortcut?: string;
      disabled?: boolean;
      submenu?: MenuItemConfig[];
    }
  | {
      divider: true;
    };
```

### Import Confirmation Flow
Sophisticated save confirmation system when importing over existing diagrams.

**ImportConfirmDialog Component:**
- **Three Options**: Save, Discard, Cancel
- **Smart Detection**: Only shows when current diagram has unsaved changes
- **File Handle Awareness**: Uses saveAs() for new files, save() for existing
- **User-Friendly Messages**: Clear explanation of what will happen
- **Consistent Styling**: Matches application theme and design language

**User Flow:**
1. User selects file to import
2. System checks if current diagram has changes
3. If changes exist → Show confirmation dialog
4. User chooses:
   - **Save**: Saves current work then imports
   - **Discard**: Imports without saving
   - **Cancel**: Aborts import operation

## Production Deployment Integration

### API Communication
The frontend uses different methods for local backend vs external API communication:

1. **Local Backend (axios with interceptors)**: Automatically adds authentication headers
   ```javascript
   // All axios calls to local backend get headers automatically
   api.post('/api/analyze', data);  // Goes to localhost:3002
   ```

### Port Detection
The frontend connects to the local backend server:
- **Development**: Uses `REACT_APP_API_URL` from `.env.development` (default: http://localhost:3002)
- **Production**: Connects to the configured backend URL (can be same origin or separate API server)
- **CORS Configuration**: Backend configured to accept requests from browser origin

### Connection Management
The `ConnectionManager` service provides:
- Automatic reconnection with exponential backoff
- Visual connection status indicator
- Error recovery mechanisms
- Health checks every 2 minutes with proper authentication
- CORS-aware communication with backend

**Important**: Health check requests must include the `X-App-Secret` header:
```javascript
const response = await fetch(`${serverUrl}/api/health`, {
  method: 'GET',
  headers: { 
    'Content-Type': 'application/json',
    'X-App-Secret': process.env.REACT_APP_SECRET || 'ai-threat-modeler-dev-secret'
  },
  signal: controller.signal
});
```

### Build Hardening (Production)

- Production build process:
  - `npm run build:prod` - Standard production build without source maps
  - `npm run build:prod-selective` - Production with selective obfuscation (recommended)
  - `npm run build:prod-obf` - Production with full obfuscation (causes performance issues)

- Selective Obfuscation Strategy (Default for Production):
  - Only protects files containing critical IP/security code
  - Preserves canvas performance by skipping UI components
  - Pattern-based detection targets:
    - Cryptographic operations (encryption/decryption)
    - API secrets and private keys
  - Files with mixed sensitive/performance code are skipped entirely

- Build optimizations:
  - Tree shaking to remove unused code
  - Code splitting for optimal loading
  - Asset optimization and compression
  - Selective JavaScript obfuscation for IP protection
  - Source maps disabled (`GENERATE_SOURCEMAP=false`)

- Result:
  - Protected intellectual property without performance degradation
  - Smooth canvas operations maintained
  - Optimized bundle sizes for fast loading
  - Browser-compatible output ready for deployment

### External Link Handling

External links are handled natively by the browser:

```typescript
// linkUtils.tsx - Browser-native approach
export const openExternalLink = (url: string): boolean => {
  try {
    const result = window.open(url, '_blank', 'noopener,noreferrer');
    return !!result;
  } catch (error) {
    console.error('Failed to open external link:', error);
    return false;
  }
};
```

**Key Points**:
1. **Native Browser API**: Uses standard `window.open()` for external links
2. **Security**: `noopener,noreferrer` prevents window.opener access
3. **Pop-up Handling**: Users may need to allow pop-ups for the domain
4. **Used Throughout**: All external link handling uses this approach

### Production Build Issues

#### ReactFlow State Management in Production

**Issue**: "Cannot read properties of undefined (reading 'getState')" error in production builds when using ReactFlow hooks or accessing undo/redo functionality.

**Root Cause**: ReactFlow uses Zustand for internal state management. In production builds with minification and optimization:
1. The `useStoreApi` hook can return undefined during component initialization
2. Timing issues occur when accessing ReactFlow's internal store
3. The error typically manifests when using copy/paste or undo/redo features

**Solution Implemented**:

1. **Removed Direct Store Access**: The `useCopyPaste` hook was refactored to remove `useStoreApi` usage:
   ```typescript
   // REMOVED - Causes production issues
   const store = useStoreApi();
   
   // Use only public ReactFlow APIs instead
   const { getNodes, setNodes, getEdges, setEdges } = useReactFlow();
   ```

2. **Error Boundaries**: Added try-catch blocks around all undo/redo operations:
   ```typescript
   // In DiagramEditor.tsx
   useEffect(() => {
     const interval = setInterval(() => {
       if (diagramEditorInnerRef.current) {
         try {
           const inner = diagramEditorInnerRef.current;
           setCanUndo(inner.canUndo);
           setCanRedo(inner.canRedo);
           undoRef.current = inner.undo;
           redoRef.current = inner.redo;
         } catch (error) {
           // Ignore errors during initialization in production builds
           console.warn('Undo/redo state not ready yet');
         }
       }
     }, 100);
     
     return () => clearInterval(interval);
   }, []);
   ```

3. **Graceful Degradation**: All undo/redo calls wrapped with error handling:
   ```typescript
   case 'undo':
     try {
       undoRef.current();
     } catch (error) {
       console.error('Undo failed:', error);
       showToast('Unable to undo at this time', 'error');
     }
     break;
   ```

**Best Practices for ReactFlow in Production**:
1. Avoid using internal ReactFlow APIs (`useStoreApi`, direct store access)
2. Use only documented public APIs from `useReactFlow` hook
3. Implement error boundaries around state-dependent operations
4. Test thoroughly in production builds, not just development
5. Consider timing issues with component initialization

**Temporary Workaround**: If issues persist, features can be temporarily disabled by returning stub functions:
```typescript
export function useCopyPaste(options: UseCopyPasteOptions = {}) {
  // Temporarily disabled - returning stub functions
  return {
    cut: () => showToast?.('Feature temporarily disabled', 'info'),
    copy: () => showToast?.('Feature temporarily disabled', 'info'),
    paste: () => showToast?.('Feature temporarily disabled', 'info'),
    canCopy: false,
    canPaste: false,
    bufferedNodes: [],
    bufferedEdges: [],
  };
}
```

## Performance Optimizations

The application implements several performance optimizations to ensure smooth operation in production builds:

### React.memo Optimizations
- **SecurityNodes**: Optimized comparison function that avoids expensive JSON.stringify operations
- **Custom comparison**: Granular property comparison for node data changes
- **Shallow comparison**: Only comparing relevant properties that affect rendering

### Event Handler Optimization
- **Debounced position updates**: Node position changes are debounced by 50ms to reduce re-renders during dragging
- **Throttled selection handler**: Selection changes are throttled to 16ms (60fps) for smooth multi-selection
- **Drawing layer throttling**: Mouse move events in drawing layer are throttled to maintain 60fps
- **Separated change handling**: Position changes processed separately from other node changes to optimize rendering

### ReactFlow Performance Settings
- **Node origin centering**: `nodeOrigin={[0.5, 0.5]}` for better positioning calculations
- **Selective interactions**: Controls for draggable, connectable, and selectable based on lock state
- **Auto-pan optimization**: Enabled for node dragging and connections
- **Attribution positioning**: Fixed to prevent layout recalculations
- **Pro options**: `hideAttribution` enabled to reduce DOM elements

### Production Build Optimizations
- **Source maps disabled**: `GENERATE_SOURCEMAP=false` reduces bundle size
- **Runtime chunk inlining disabled**: `INLINE_RUNTIME_CHUNK=false` for better caching
- **Image optimization**: `IMAGE_INLINE_SIZE_LIMIT=10000` for optimal asset handling
- **Obfuscation**: Production builds use JavaScript obfuscation for code protection
- **Environment variables**: Configured via `.env.production` for consistent builds

### Memory Management
- **useMemo hooks**: Expensive calculations (colors, styles, icons) are memoized
- **Cleanup on unmount**: Proper cleanup of event listeners and intervals
- **Lazy state updates**: Position updates separated from other node changes
- **Debounced tracking**: Change tracking debounced to prevent excessive updates

## Multiselection System Fixes (2025-01)

### Issue Resolution
The application had three critical multiselection issues that have been resolved:

1. **Multiple Selection Boxes Being Created**
   - **Problem**: Duplicate selection boxes appeared during multiselect operations
   - **Solution**: Added `isSelectionInProgressRef` flag in DiagramEditor.tsx to prevent duplicate selection processing
   - **Implementation**: Used requestAnimationFrame to batch selection updates and prevent rapid re-renders

2. **Edge Labels Competing with Nodes for Z-Order**
   - **Problem**: Edge labels would flash and compete with nodes for visibility during selection
   - **Root Cause**: SVG elements don't properly respect CSS z-index
   - **Solution**: Converted edge labels from SVG `<g>` elements to `<foreignObject>` elements
   - **Benefits**: foreignObject allows proper HTML/CSS z-index control, ensuring labels always appear on top

3. **Not All SecurityNodes Being Selected**
   - **Problem**: Some security nodes within the selection box weren't being selected
   - **Root Cause**: Inverted selection logic in drawing mode check
   - **Solution**: Fixed the useEffect in DiagramEditor.tsx to ensure security nodes are selectable when NOT in drawing edit mode

### Technical Implementation

#### Z-Index Hierarchy (Updated)
```css
.react-flow__edges { z-index: 1; }
.react-flow__nodes { z-index: 2; }
.react-flow__node.selected { z-index: 999; }
.react-flow__selection { z-index: 1001; }
.react-flow__edge-label-container { z-index: 1002; } /* Highest priority */
```

#### Selection State Management
```typescript
// Prevent duplicate selection boxes
const isSelectionInProgressRef = useRef(false);

const onSelectionChange = useOptimizedSelectionHandler({
  onSelectionChange: ({ nodes: selectedNodes }) => {
    if (isSelectionInProgressRef.current) return;
    
    isSelectionInProgressRef.current = true;
    requestAnimationFrame(() => {
      batchedSelectionHandler(selectedNodes);
      setSelectedNodeIds(selectedNodes.map(node => node.id));
      
      setTimeout(() => {
        isSelectionInProgressRef.current = false;
      }, 50);
    });
  }
});
```

#### Edge Label foreignObject Implementation
```typescript
// In EditableSecurityEdge.tsx
<foreignObject
  x={labelPosition.x - labelWidth / 2}
  y={labelPosition.y - labelHeight / 2}
  width={labelWidth}
  height={labelHeight}
  className="react-flow__edge-label-container"
  style={{ overflow: 'visible' }}
>
  <div style={{
    position: 'relative',
    zIndex: 1002,
    background: colors.surface,
    border: `${strokeWidth}px solid ${zoneColor}`,
    borderRadius: '4px',
    // ... other styles
  }}>
    {/* Label content */}
  </div>
</foreignObject>
```

### CSS Optimizations
- Disabled animations during multiselect to prevent flashing
- Added `will-change: auto` to prevent unnecessary GPU acceleration
- Ensured proper pointer-events for selection box functionality
- Fixed z-index conflicts between nodes, edges, and labels

### Results
- Smooth multiselection without visual artifacts
- Edge labels consistently appear above all other elements
- All nodes within selection box are properly selected (respecting security rules)
- No duplicate selection boxes or flashing during selection operations

## Conclusion

The AI Threat Modeler frontend architecture represents a sophisticated integration of modern React patterns, performance optimizations, and security-focused design. The modular component system allows for easy extension while maintaining consistency and performance across the application.

The careful separation of concerns between visual components (nodes, edges, zones) and business logic (AI analysis, file operations) creates a maintainable and scalable architecture perfectly suited for browser-based deployment.

The production deployment enhancements ensure reliable communication with the backend server through proper authentication, CORS configuration, and robust connection management.

## Browser-Specific Considerations

### Security
- **API Key Storage**: Uses Web Crypto API with AES-GCM encryption and PBKDF2 key derivation
- **CORS Configuration**: Backend configured with appropriate CORS headers for browser access
- **HTTPS Requirement**: Production deployments should use HTTPS for secure API key transmission
- **Content Security Policy**: Configured to prevent XSS attacks while allowing necessary functionality

### Browser APIs Used
- **Web Crypto API**: For client-side encryption of sensitive data
- **File System Access API**: For saving and loading diagram files
- **localStorage**: For persisting encrypted settings and preferences
- **Canvas API**: For drawing and annotation features
- **WebGL**: For GPU-accelerated diagram rendering

### Browser Compatibility
- **Minimum Requirements**: Chrome 95+, Firefox 91+, Safari 15.4+, Edge 95+
- **Feature Detection**: Graceful fallbacks for unsupported APIs
- **Progressive Enhancement**: Core functionality works in all modern browsers

### Deployment Options
- **Static Hosting**: Frontend can be deployed to any static hosting service (Netlify, Vercel, S3)
- **Backend API**: Can be deployed separately or together with frontend
- **Docker Support**: Containerized deployment for easy scaling
- **No Installation**: Users access directly through web browser without installation
