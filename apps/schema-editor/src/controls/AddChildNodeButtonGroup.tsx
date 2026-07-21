
import React, { useState } from 'react';
import { Button, Box, Typography, Paper, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import ChildNodeButton from './ChildNodeButton';
import ShowOnceSnackbarAlert from './ShowOnceSnackbarAlert';
import { Schema, resolveRef, generateMVPFromSchema } from '@grani/schema-tools';
import SchemaFormControl from './SchemaFormControl';

interface ArraySchemaMap {
  [key: string]: Schema[];
}

interface Node {
  type: string;
  // Define other properties of Node based on your data structure
}

interface AddChildNodeButtonGroupProps {
  path: (string | number)[];
  schema: Schema;
  editedData: any; // Consider providing a more specific type based on your data structure
  onAddChild: (path: (string | number)[], childType: Schema) => void;
}

const supportedCompositeTypes: Array<keyof Schema> = ['oneOf', 'allOf', 'anyOf'];

const AddChildNodeButtonGroup: React.FC<AddChildNodeButtonGroupProps> = ({
  path,
  schema,
  editedData,
  onAddChild,
}) => {

  
  const [snackbarProps, showSnackbar] = useState({key:"",message:"",show:false});
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedSchemaForModal, setSelectedSchemaForModal] = useState<Schema | null>(null);
  const [selectedArrayKeyForModal, setSelectedArrayKeyForModal] = useState<string | null>(null);
  const [emptyNode, setEmptyNode] = useState<any>(null);
  
  
const resolveSchemaItem = (item: Schema | { $ref: string }, rootSchema: Schema): Schema[] => {
  //console.log(`Resolving ${JSON.stringify(item)}`)
	// Resolve $ref to actual schema
	const resolvedItem: 
		Schema | undefined = ('$ref' in item) ? 
		resolveRef(rootSchema, item.$ref!): 
		(item as Schema);

    //console.log(`Resolved to ${JSON.stringify(resolvedItem)}`)

	if (resolvedItem === undefined) {
	  console.log("I'm lost, maybe?");
	  return [];
	}

	// Recursively resolve oneOf, allOf, anyOf
	for (const compositeType of supportedCompositeTypes) {
	  if (resolvedItem[compositeType] ){
      //console.log(`Item was of type ${compositeType}`)
      const compositeTypeList:Schema[] = (resolvedItem[compositeType] as Schema[]);
      return compositeTypeList.flatMap(subItem => resolveSchemaItem(subItem, rootSchema));
	  }
	}
  
	// If resolved schema is an array, process its items
	if (resolvedItem.type === 'array') {
    //console.log("Item is an array, skipping");
      showSnackbar({
        key: "Array of Arrays Detected",
        message: "Arrays of Arrays detected as a subtype of reference",
        show:true
      });
      return [];
  }
	//console.log("Item was a raw property");
	// For non-array, non-composite types, return the resolved schema itself
	return [resolvedItem];
};


const findArraysInSchemaNode = (currentSchema: Schema, rootSchema: Schema): ArraySchemaMap => {
	const arrays: ArraySchemaMap = {};

	if (currentSchema === undefined) {
	  console.log("I'm lost, maybe?");
	  return {};
	}
  
	Object.entries(currentSchema.properties || {}).forEach(([propertyName, propValue]) => {
    console.log(`Handling button: ${propertyName}`);
	  if (propValue.type === 'array') {
		  let itemSchemas: Schema[] = [];
    
      // Handle arrays of heterogeneous items
      if (Array.isArray(propValue.items)) {
        console.log("Is array, skipping");
        showSnackbar({
          key: "Array of Arrays Detected",
          message: "Arrays of Arrays are not supported for automatic new item creation at this time. You can still manually create them, or add children to existing ones.",
          show:true
        });
      }
      // Handle single item arrays
      else if (propValue.items) {  
        resolveSchemaItem(propValue.items, rootSchema).map (schemaItem => itemSchemas.push(schemaItem));
      }
    
      arrays[propertyName] = itemSchemas;
	  }
	});
  
	return arrays;
};

  const findSchemaByPath = (schema: Schema, path: Array<string | number>): Schema | undefined => {
    let currentSchema: Schema | undefined = schema;

    // console.log(`Initial data`)
    // console.log(`Schema: ${JSON.stringify(currentSchema)}`);
    // console.log(`Overall path: ${path}`);
  
    for (const segment of path) {
      //console.log(`Current path node: ${segment}`)
      if (currentSchema.$ref) {
        //console.log("Resolving mid ref")
        currentSchema = resolveRef(schema, currentSchema.$ref);
        if (currentSchema === undefined) {
          console.log("Bad ref");
          return undefined;
        }
      } 
      if (currentSchema.type === 'object' && currentSchema.properties && typeof segment === 'string') {
        currentSchema = currentSchema.properties[segment];
      } else if (currentSchema.type === 'array' && currentSchema.items && typeof segment === 'number') {
        if (Array.isArray(currentSchema.items)) {
          currentSchema = currentSchema.items[segment]; 
        } else {
          currentSchema = currentSchema.items;
        }
      } else {
        //console.log("Breaking");
        //console.log(`Breaking at ${JSON.stringify(currentSchema)}`)
        return undefined;
      }
  
      if (!currentSchema) {
        //console.log("No segment found");
        return undefined;
      }
    }

    if (currentSchema.$ref) {
      //console.log("Resolving ending ref")
      currentSchema = resolveRef(schema, currentSchema.$ref);
    }
    //console.log(`EndingSchema : ${JSON.stringify(currentSchema)}`);
    return currentSchema;
  };

  const handleSelection = (arrayKey: string, selectedSchema: Schema) => {
    //console.log("SelectedSchema ", selectedSchema, arrayKey);
    //console.log(`Adding new instance of: ${selectedSchema.properties?.type?.const}`);

    setSelectedSchemaForModal(selectedSchema); 
    setSelectedArrayKeyForModal(arrayKey);
    setIsModalOpen(true); // Open the modal
    const mvp = generateMVPFromSchema(selectedSchema);
    setEmptyNode(mvp);

    //const mvp = generateMVPFromSchema(selectedSchema);


    // console.log(JSON.stringify(selectedSchema))
    // console.log(`MVP : ${JSON.stringify(mvp)}`);
    // onAddChild([...path, arrayKey], mvp);
  };
  const submitNewChild = (path:(string | number)[], nodeData:Schema ):void => {

    const mvp = generateMVPFromSchema(selectedSchemaForModal!);

    console.log (`Comparing ${nodeData} with ${mvp}`);
    
    onAddChild(path, nodeData);
  }
  

  const currentSchema = findSchemaByPath(schema, path);
  const availableArrays = findArraysInSchemaNode(currentSchema!, schema);
  return (  
    <Box 
      padding={'5px'} 
      sx={{ 
        display: 'flex', 
        flexDirection: 'row', // Aligns children in a row
        flexWrap: 'wrap', // Allows children to wrap to the next line
        gap: '10px' // Adjust this value to control the spacing between buttons
      }}
    >
      {Object.entries(availableArrays).map(([arrayKey, itemSchemas]) => (
        <ChildNodeButton
          key={arrayKey}
          arrayKey={arrayKey}
          itemSchemas={itemSchemas}
          onSelect={handleSelection}
        />
      ))}
        <ShowOnceSnackbarAlert
          uniqueMessageKey = {snackbarProps.key}
          show={snackbarProps.show}
          message={snackbarProps.message}
          severity="info"
        />
        <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <DialogTitle>Enter Data</DialogTitle>
          <DialogContent>
            {selectedSchemaForModal && (
              <SchemaFormControl
                schema={selectedSchemaForModal}
                mvp={emptyNode!}
                onSubmit={(formData) => {
                  submitNewChild([...path, selectedArrayKeyForModal!], formData);
                  setIsModalOpen(false);
                }}
                onCancel={() => setIsModalOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
        
    </Box>
  );
};

export default AddChildNodeButtonGroup;

