import React, { useEffect } from 'react';
import {TreeView} from '@mui/x-tree-view/TreeView';
import {TreeItem} from '@mui/x-tree-view/TreeItem';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Link, Paper } from '@mui/material';

interface NodeItem {
  name?: string;
  id?: string;
  [key: string]: any;
}

interface PathItem {
  key: string | number;
  label: string;
  type: 'array' | 'object' | 'value'; // Add a type property
  node: NodeItem
}

interface EditorTreeViewProps {
  data: NodeItem;
  handleItemClick: (node: NodeItem, breadcrumbs: () => JSX.Element[], newPath: (string | number)[]) => void;
}

const generateNodeId = (path: (string | number)[]): string => path.join("-");

const EditorTreeView: React.FC<EditorTreeViewProps> = ({ data, handleItemClick }) => {
  const renderTreeViewNode = (node: NodeItem | NodeItem[],  path: PathItem[] = []): JSX.Element => {
    
    const getLabel = (node: any, keyPath: (string | number)[]): string => {
      if (keyPath.length === 0) {
        return 'Root'; //Always display the top as root.
      }else if (Array.isArray(node)) {
        return `${keyPath[path.length-1]}`
      } else if (typeof node === 'object' && node !== null) {
        if (node.name) {
          return node.name;
        } else if (node.label) {
          return node.label;
        } else if (node.id) {
          return node.name;
        } else if (Object.keys(node).length > 0) {
          const firstKey = Object.keys(node)[0];
          const firstValue = node[firstKey];
          if (typeof firstValue === 'object') {
            return firstKey;
          } else {
            return `${firstKey}: ${firstValue}`;
          }
        }
      }
      return keyPath[path.length - 1].toString();  
    };

    const nodeName = getLabel(node, path.map(p=>p.key) || 'Root');
    const nodeId = generateNodeId([...path.map(p=>p.key), nodeName]);


    if (Array.isArray(node)) {
      //const onItemClick = () => handleItemClick(node, () => generateBreadcrumbLinks(path), path.map(p=>p.key));
      return (
        <TreeItem key={nodeId} nodeId={nodeId} label={`${nodeName}`}>
          {// onClick={onItemClick}>
            node.map((item, index) => {
              const updatedPath = [...path, {key:index, label: nodeName, type:'value' as 'value', node: node}]
              return renderTreeViewNode(item, updatedPath)
            })
          }
        </TreeItem>
      );
    } else if (typeof node === 'object' && node !== null) {
      const bcPath = [...path, {key:nodeId, label: nodeName, type:'value' as 'value', node: node}]
      const onItemClick = () => handleItemClick(node, () => generateBreadcrumbLinks(bcPath), path.map(p=>p.key));
      return (
        <TreeItem key={nodeId} nodeId={nodeId} label={`${nodeName}`} onClick={onItemClick}>
          {Object.entries(node).map(([key, value]) => {
            const updatedPath = [...path, {key, label: nodeName, type:'value' as 'value', node: node}]
            return renderTreeViewNode(value, updatedPath)
          })}
        </TreeItem>
      );
    } else {
      return <TreeItem key={nodeId} nodeId={nodeId} label={`${nodeName}: ${node}`} />;
    }
  };


  const generateBreadcrumbLinks = (nodes:any[], path: PathItem[] = []):JSX.Element[] => {
    const parentNodes = [...nodes];
    if (nodes.length === 0) return([]);
    const lastNode = parentNodes.pop();

    // Skip drawing link items for array types
    if (Array.isArray(lastNode.node)) {
          return generateBreadcrumbLinks(parentNodes, path);
    }
    return [...generateBreadcrumbLinks(parentNodes), (
      <Link key={`${lastNode.key}_bc`} onClick={() => handleItemClick(lastNode.node, () => generateBreadcrumbLinks(nodes),path.map(p=>p.key)) }>
        {lastNode.label}
      </Link>
    )];
};

  return (
      <TreeView defaultCollapseIcon={<ExpandMoreIcon />} defaultExpandIcon={<ChevronRightIcon />}>
        {renderTreeViewNode(data)}
      </TreeView>
  );
};

export default EditorTreeView;



