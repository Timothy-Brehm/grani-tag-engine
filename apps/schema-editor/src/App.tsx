import React, { useState, useEffect, useRef } from 'react';
import { Typography, Tabs, Tab } from '@mui/material';
import FileLoadTab from './controls/FileLoadTab';
import Ajv from 'ajv';
import ModalComponent from './controls/ModalComponent';
import { getValidationMessage } from '@grani/schema-tools';
import EditTab from './controls/EditTab';

function App() {
  const [schema, setSchema] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [tabValue, setTabValue] = useState(0);
  const [editTabDisabled, setEditTabDisabled] = useState(true);

  const [dataFileHandle, setDataFileHandle] = useState<FileSystemFileHandle>()

  //Modal Config
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');
  const [modalOpen, setModalOpen] = useState(false); 

  const passthrough = (fileHandle: React.SetStateAction<FileSystemFileHandle | undefined>) => {
    console.log("Setting fileHandle")
    if (fileHandle === undefined) {
      console.log("But it's undefined");
    }
    setDataFileHandle(fileHandle);
  }

  const handleSchemaLoaded = (loadedSchema: any) => {
    console.log("Loaded Schema: ", loadedSchema);
    setSchema(loadedSchema);
  };

  const handleDataLoaded = (loadedData: any) => {
    console.log("Loaded Data: ", loadedData);
    setData(loadedData);
  };
  useEffect(() => {
	console.log("Reloading");
    if (schema && data && validateDataToSchema(data, schema)) {
		setEditTabDisabled(false);
    } else {
		setEditTabDisabled(true);
    }
  }, [schema, data]);

  const handleChangeTab = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };
  const validateDataToSchema = (data: any, schema: any) => {
	const ajv = new Ajv();

	try {
		const validate = ajv.compile(schema);
		const valid = validate(data);
		if (!valid) {
			console.log("Invalid data: ", validate.errors);
			displayModal("Invalid JSON", getValidationMessage(validate.errors))
			return false;
		}
		console.log("Data is Valid!")
		return true;
	}
	catch (error:any) {
		displayModal("Invalid Schema", error.toString())
		console.log("Error validating data: ", error);
		return false;
	}
	
  }	

  const displayModal = (title: string, content: string) => {
	  setModalTitle(title);
	  setModalContent(content);
	  setModalOpen(true);
	};

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <Tabs
        value={tabValue}
        onChange={handleChangeTab}
        aria-label="tabs"
        style={{ backgroundColor: '#4A4E69' }} // Slate grey background color
        indicatorColor="primary"
        textColor="primary"
      >
        <Tab label="Load" />
        <Tab label="Edit" disabled={editTabDisabled}/>
      </Tabs>
      <div style={{ flexGrow: 1 }}>
        {tabValue === 0 && (
          <FileLoadTab
            schema={schema}
            data={data}
            onSchemaLoaded={handleSchemaLoaded}
            onDataLoaded={handleDataLoaded}
            onFileHandleCreated={passthrough}
          />
        )}
        {tabValue === 1 && (
          <div>
			      <EditTab data={data} schema={schema} dataFileHandle = {dataFileHandle}/>
          </div>
        )}
      </div>
	  <ModalComponent title={modalTitle} content={modalContent} open={modalOpen} handleClose={() => setModalOpen(false)}/>
    </div>
  );
}

export default App;
