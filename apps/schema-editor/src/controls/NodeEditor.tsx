// NodeEditor.tsx

import React, { useEffect, useState } from 'react';
import { Typography, Divider, TextareaAutosize, Button, Paper, TextField } from '@mui/material';

interface NodeEditorProps {
  selectedNode: any;
  onChange: (updatedNode: any) => void;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ selectedNode, onChange }) => {
  const [nodeText, setNodeText] = useState<string>(JSON.stringify(selectedNode, null, 2));
  const [dirtyFlag, setDirtyFlag] = useState<boolean>(false);

  
  useEffect(() => {
    setNodeText(JSON.stringify(selectedNode, null, 2));
  }, [selectedNode]); // This line makes sure that nodeData is updated whenever selectedNode changes

  const handleConfirm = () => {
    try {
      // Parse the edited text back into JSON before calling onChange.
      const updatedNode = JSON.parse(nodeText);
      onChange(updatedNode);
      console.log("Dirty Flag on confirm", dirtyFlag);
      setDirtyFlag(false);
    } catch (error) {
      // Handle parsing error (e.g., show an error message if the JSON is invalid).
      console.error("Failed to parse JSON:", error);
    }
  };

  return (

    <div style={{
      boxSizing: 'border-box', 
      padding: '16px', // Example padding, adjust as necessary
      resize: 'none', 
      fontFamily: 'monospace',
	  width: '100%'
    }}>
      <Typography variant="body1">Node Content:</Typography>
      <TextField
		fullWidth
		multiline
		minRows={10}
		value={nodeText}
		onChange={(e) => {
			setDirtyFlag(true);
			setNodeText(e.target.value);
		}}
		variant="outlined"
		style={{ fontFamily: 'monospace', 
			backgroundColor: 'black',
			color: 'white'}}
		InputProps={{
			style: {
				backgroundColor: 'black',
				color: 'white',
				fontFamily: 'monospace',
			},}}
	  />

      <Button disabled={!dirtyFlag} variant="contained" color="primary" onClick={handleConfirm} style={{ marginTop: '16px' }}>
        Confirm
      </Button>
    </div>
  );
};

export default NodeEditor;
