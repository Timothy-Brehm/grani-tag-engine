// ChildNodeButton.tsx
import React, { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem } from '@mui/material';
import { Schema } from '../logic/Schema';
import SchemaFormControl from './SchemaFormControl';


interface ChildNodeButtonProps {
  arrayKey: string;
  itemSchemas: Schema[];
  onSelect: (arrayKey: string, selectionSchema: Schema) => void;
}

const ChildNodeButton: React.FC<ChildNodeButtonProps> = ({ arrayKey, itemSchemas, onSelect }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (type: Schema) => {
    onSelect(arrayKey, type);
    handleClose(); // Close the menu after selection
  };

   // Function to determine the label for each schema
   const getSchemaLabel = (schema: Schema, index: number) => {
    //console.log(`Button button: ${JSON.stringify(schema)}`)
    return schema?.properties?.name?.const || schema?.properties?.type?.const || `type ${index + 1}`;
  };

  if (itemSchemas.length === 1) {
    // Single item schema
	//console.log(`Array Key ${arrayKey} is a single select`)
    return (
      <Button variant="contained" onClick={() => handleSelect(itemSchemas[0])}>
        Add new {arrayKey}
      </Button>
    );
  } else {
    // Multiple item schemas
	//console.log(`Array Key ${arrayKey} is a multi select`)
    return (
      <>
        <Button variant="contained" onClick={handleClick}>
          Add new {arrayKey}
        </Button>
        <Menu
          anchorEl={anchorEl}
          keepMounted
          open={Boolean(anchorEl)}
          onClose={handleClose}
        >
          {itemSchemas.map((schema, index) => (
            <MenuItem key={index} onClick={() => handleSelect(schema)}>
              Add {arrayKey} - {getSchemaLabel(schema, index)}
            </MenuItem>
          ))}
        </Menu>
      </>
    );
  }
};

export default ChildNodeButton;
