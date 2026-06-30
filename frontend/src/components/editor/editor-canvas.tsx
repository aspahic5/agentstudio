import { useCallback, type DragEvent } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './nodes';
import { useFlowStore } from '@/stores/flow-store';
import type { EditorNodeType } from '@/types/editor';

export function EditorCanvas() {
  const rfNodes = useFlowStore((s) => s.rfNodes);
  const rfEdges = useFlowStore((s) => s.rfEdges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const addNode = useFlowStore((s) => s.addNode);
  const selectNode = useFlowStore((s) => s.selectNode);

  const handleConnect: OnConnect = useCallback(
    (connection) => onConnect(connection),
    [onConnect],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('application/reactflow') as EditorNodeType;
      if (!nodeType) return;

      // Get the ReactFlow instance to convert screen coords to flow coords
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const position = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      addNode(nodeType, position);
    },
    [addNode],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onConnect={handleConnect}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.1}
      maxZoom={2}
      className="bg-bg-soft"
    >
      <Controls className="!bg-white !border-border-light !shadow-soft" />
      <MiniMap className="!bg-white !border-border-light !shadow-soft" />
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#E8DDD0" />
    </ReactFlow>
  );
}
