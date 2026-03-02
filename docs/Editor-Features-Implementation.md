# Editor Features Implementation

## Overview
This document describes the implementation of key editor features including Show/Hide Grid, Show/Hide Minimap, Copy/Paste, and Undo/Redo functionality.

## Features Implemented

### 1. Show/Hide Grid
- **State**: `showGrid` (default: true)
- **Menu**: View → Show/Hide Grid
- **Implementation**: Conditionally renders ReactFlow's `<Background>` component
- **Code**: Toggle handled in View menu's `toggleGrid` action

### 2. Show/Hide Minimap
- **State**: `showMinimap` (default: false)
- **Menu**: View → Show/Hide Minimap
- **Implementation**: Conditionally renders ReactFlow's `<MiniMap>` component
- **Features**:
  - Color coding for security zones
  - Pannable and zoomable
  - Styled to match theme

### 3. Copy/Paste Functionality
- **State**: `clipboard` stores copied nodes and edges
- **Keyboard Shortcuts**: 
  - Copy: Ctrl+C
  - Paste: Ctrl+V
- **Features**:
  - Copies selected nodes and their interconnecting edges
  - Paste adds "(copy)" suffix to labels
  - Generates unique IDs with timestamp
  - Maintains edge connections between pasted nodes
  - 50px offset to avoid overlap with originals

### 4. Undo/Redo Functionality
- **Hook**: `useUndoRedo` custom hook
- **Keyboard Shortcuts**:
  - Undo: Ctrl+Z
  - Redo: Ctrl+Y or Ctrl+Shift+Z
- **Features**:
  - Maintains history stack (max 50 states)
  - Tracks significant changes (add/remove nodes/edges)
  - Ignores position-only changes for performance
  - Menu items show enabled/disabled state
  - Clears history on diagram clear

## Keyboard Shortcuts Summary

| Action | Shortcut |
|--------|----------|
| Save | Ctrl+S |
| Save As | Ctrl+Shift+S |
| Open | Ctrl+O |
| Copy | Ctrl+C |
| Paste | Ctrl+V |
| Undo | Ctrl+Z |
| Redo | Ctrl+Y or Ctrl+Shift+Z |

## Implementation Details

### History Management
- History is tracked using a custom hook `useUndoRedo`
- Only significant changes trigger history saves:
  - Node/edge additions
  - Node/edge deletions
  - Node property changes
- Position-only changes are ignored to prevent cluttering history

### Performance Considerations
- History tracking is debounced to prevent excessive state updates
- Position changes during drag operations don't trigger history saves
- Maximum history size prevents memory issues

### Integration Points
- `onNodesChange`: Tracks node changes and adds to history
- `onEdgesChange`: Tracks edge changes and adds to history
- `handleNodeUpdate`: Tracks node property updates
- `onConnect`: Tracks new connections
- `clearDiagram`: Clears undo/redo history

## Testing Guide

1. **Grid Toggle**:
   - Click View → Show/Hide Grid
   - Grid dots should appear/disappear

2. **Minimap Toggle**:
   - Click View → Show/Hide Minimap
   - Minimap should appear in bottom right
   - Test pan/zoom within minimap

3. **Copy/Paste**:
   - Select nodes
   - Press Ctrl+C (or Edit → Copy)
   - Press Ctrl+V (or Edit → Paste)
   - Verify copied nodes appear with "(copy)" suffix

4. **Undo/Redo**:
   - Make changes (add/remove nodes)
   - Press Ctrl+Z to undo
   - Press Ctrl+Y to redo
   - Verify menu items enable/disable appropriately

## Files Modified

1. **src/components/DiagramEditor.tsx**
   - Added view states and clipboard state
   - Implemented keyboard shortcuts
   - Added menu actions
   - Integrated undo/redo hook

2. **src/hooks/useUndoRedo.ts** (new)
   - Custom hook for undo/redo functionality
   - Manages history stack
   - Provides undo/redo methods

3. **src/contexts/MenuContext.tsx**
   - Already existed for menu coordination

## Future Enhancements

1. **Persistent Grid/Minimap Settings**: Save user preferences
2. **Smart Paste**: Intelligently position pasted nodes to avoid overlaps
3. **Selective Undo**: Undo specific types of changes
4. **Multi-level Copy**: Deep copy including nested components
5. **Visual Indicators**: Show undo/redo preview