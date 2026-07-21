import React, { useEffect, useState } from 'react';
import { Box, Breadcrumbs, Divider, Link, Paper, TextareaAutosize, Typography } from '@mui/material';
import EditorTreeView from './EditorTreeView';
import NodeEditor from './NodeEditor';
import ModalComponent from './ModalComponent';
import { getValidationMessage } from '@grani/schema-tools';
import Ajv, { ValidateFunction } from 'ajv';
import SaveToFile from './SaveToFileButton';
import AddChildNodeButtonGroup from './AddChildNodeButtonGroup';
import type { Schema } from '@grani/schema-tools';


const ajv = new Ajv();

const EditTab = ({ data, schema, dataFileHandle}: { data: any, schema:any, dataFileHandle?:FileSystemFileHandle | undefined }) => {
	const [breadcrumb, setBreadcrumb] = useState<JSX.Element[]>([]);
	const [editedData, setEditedData] = useState<any>(data);
	const [activeNode, setActiveNode] = useState<any>(data);
  const [path, setPath] = useState<(string | number)[]>([]);
	const [validate, setValidate] = useState<ValidateFunction>();
	
  //Modal Config
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');
  const [modalOpen, setModalOpen] = useState(false); 

  // UseEffect to compile the schema only when it changes.
  useEffect(() => {
    const compileSchema = () => {
      const validate = ajv.compile(schema);
      setValidate(() => validate); 
    };

    compileSchema();
  }, [schema]); 

	useEffect( () => {
	}, [editedData]);

  const displayModal = (title: string, content: string) => {
	  setModalTitle(title);
	  setModalContent(content);
	  setModalOpen(true);
	};  

	const getNodeByPath = (data: any, path: (string | number)[]): any => {
  let currentNode = data;
  path.forEach(segment => {
    currentNode = currentNode[segment];
  });
  return currentNode;
};

	const validateDataToSchema = (data: any, schema: any) => {
	
		try {
			const valid = validate!(data);
			if (!valid) {
				console.log("Invalid data: ", validate!.errors);
				displayModal("Invalid JSON", getValidationMessage(validate!.errors))
				return false;
			}
			return true;
		}
		catch (error:any) {
			displayModal("Invalid Schema", error.toString())
			console.log("Error validating data: ", error);
			return false;
		}
		
		}	
	
	const handleNodeSelect = (node:any, breadcrumbs:() => JSX.Element[], newPath: (string | number)[]) => {
		//console.log(`Selecting a new node : ${JSON.stringify(node)} at path ${newPath}`)
		//console.log(breadcrumbs());
		setActiveNode(node);
		setBreadcrumb(breadcrumbs());
		setPath(newPath);
	};

  const handleEditorChange = (updatedNode: any) => {
    setEditedData((prevData: any) => updateNode(prevData, updatedNode));
  };
	// Function to insert a new child node into the editedData structure
const insertNewChildAtPath = (prevData: any, path: (string | number)[], newChild: Schema): any => {
	// Deep clone prevData to avoid direct state mutation
	let updatedData = JSON.parse(JSON.stringify(prevData));

	// Navigate to the specific node in the structure
	let target = updatedData;
	for (let i = 0; i <= path.length - 1; i++) {
			//console.log(`Selecting for ${path[i]}`)
			target = target[path[i]];
			console.log(`new target ${JSON.stringify(target)}`)
	}

	if (Array.isArray(target)) {
			target.push(newChild);
	} else {

			console.error("Invalid path or target node type for adding a child.");
			console.log(`path: ${path}`)
			// Optionally, return unchanged data or handle this error appropriately
			return prevData;
	}

	// Return the updated data structure
	return updatedData;
};

	const handleAddChild = (path: (string | number)[], newChild: Schema) => {
		// Logic to add a new child node of childType to the node at path in editedData
		// This might involve updating the state of editedData
		console.log(`Adding child of type ${newChild} to path ${path}`);  
		setEditedData((prevData:any) => {      
			const updatedData = insertNewChildAtPath(prevData, path, newChild);
			setActiveNode(getNodeByPath(updatedData, path.slice(0, -1))); 
			return updatedData;
		});
		
		setActiveNode((prevNode:any) => ( {...prevNode}));
  }

  const updateNode = (prevData: any, updatedNode: any): any => {
    if (path.length === 0) {
      return updatedNode;
    }

    const newData = JSON.parse(JSON.stringify(prevData)); // Deep copy
    let currentNode = newData;
    for (let i = 0; i < path.length - 1; i++) {
      currentNode = currentNode[path[i]];
    }
		const targetKey = path[path.length - 1];    
		console.log("Path", path);
		
		// Check if the parent node is an array and targetKey is a valid index
    if (Array.isArray(currentNode) && typeof targetKey === 'number') {
        if (targetKey < 0 || targetKey >= currentNode.length) {
            console.error("Index out of bounds");
            return prevData; // Or handle this case as needed
        }
				console.log("Updating as an array");
        currentNode[targetKey] = updatedNode; 
    } else if (typeof currentNode === 'object') {
        currentNode[targetKey] = updatedNode; 
    } else {
        console.error("Invalid path or target node type");
        return prevData; 
    }

		console.log("CurrentNode:", currentNode[targetKey]);

		const newDataGood = validateDataToSchema(newData, schema);

    return newDataGood? newData : prevData;
  };
  return (
    <Box border={1} borderColor="primary.main" sx={{width:'calc(100% - 100px)', m:1, p:2}} display="flex" flexDirection="column"  >
			<Paper elevation={3} 
				sx={{ width: 'calc(100% - 100px)',p: 2, m: 1 }}>
					<Breadcrumbs aria-label="breadcrumb">
						{breadcrumb}
					</Breadcrumbs>
			</Paper>
      <Box display="flex" flexDirection="row">
				<Box overflow="auto" display="flex" flexDirection="column">  		
					<Paper elevation={3} sx={{ gap: 2, p: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'start', m:1 }}>
						<SaveToFile editedData={editedData} dataFileHandle={dataFileHandle} />
						<Divider/>
						<EditorTreeView data={editedData} handleItemClick={(
							node:any, 
							breadcrumbs:() => JSX.Element[], 
							newPath: (string | number)[]) => handleNodeSelect(node, breadcrumbs, newPath)} />
					</Paper>
				</Box>			
				<Box display="flex" flexDirection="column" sx={{width:'calc(100% - 100px)'}} >
					<Box>
    					<Paper elevation={3} 
							sx={{ display: 'inline-flex', 
								width:'calc(100% - 100px)',
								flexDirection: 'row', 
								gap: 1, 
								p: 2, 
								flexWrap: 'wrap', 
								alignItems: 'center', 
								justifyContent: 'start', m: 1}}>
								<AddChildNodeButtonGroup
									path={path}
									schema={schema}
									editedData={editedData}
									onAddChild={handleAddChild}
								/>
						</Paper>
					</Box>
					<Box>
						<Paper elevation={3} 
						  sx={{ 
							width:'calc(100% - 100px)',
							gap: 1, p: 2, m:1, flexWrap: 'wrap', 
							alignItems: 'center', justifyContent: 'start' }}>
							  <NodeEditor selectedNode={activeNode} onChange={(changedNode) => handleEditorChange(changedNode)} />
						</Paper>
					</Box>
				</Box>
      </Box>
	  	<ModalComponent title={modalTitle} content={modalContent} open={modalOpen} handleClose={() => setModalOpen(false)}/>
    </Box>
  );
};

export default EditTab;
