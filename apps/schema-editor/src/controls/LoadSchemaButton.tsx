// LoadSchemaButton.tsx
import React, { ChangeEvent } from 'react';
import { Button, Typography, Box } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';

interface LoadSchemaButtonProps {
  onFileLoaded: (fileData: any) => void; // Adjust 'any' to your schema type
  buttonLabel?: string | undefined; // Add this prop to customize the button label
  onFileHandleCreated?: (handle: FileSystemFileHandle) => void | undefined;
}

const LoadSchemaButton: React.FC<LoadSchemaButtonProps> = ({ onFileLoaded, buttonLabel, onFileHandleCreated }) => {
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFallbackFileInput = () => {
    fileInputRef.current?.click(); // Programmatically click the hidden file input
  };
  
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const fileData = JSON.parse(loadEvent.target?.result as string);
	  console.log(`Loaded File in control ${buttonLabel}: `, fileData)
      onFileLoaded(fileData);
	  // Clear the file input value to trigger its change event next time
	  event.target!.value = ''; // Reset the file input value
    };
    reader.readAsText(file);
  };
  const handleLoadFileViaAPI = async () => {
    try {
      if ('showOpenFilePicker' in window) {
        console.log("Trying to load via API");
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'JSON Files',
            accept: {
              'application/json': ['.json']
            }
          }],
        });
        const file = await handle.getFile();
        const contents = await file.text();
        onFileLoaded(JSON.parse(contents))
        onFileHandleCreated && onFileHandleCreated(handle);
      }
      else {
        handleFallbackFileInput();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const inputId = `schema-file-input-${uuidv4()}`; // Generate unique id
  return (
    <Box>
      <input
        ref={fileInputRef} // Add this ref to your input
        accept=".json"
        id={inputId}
        type="file"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
        <Button variant="contained" component="span" onClick={handleLoadFileViaAPI}>
          {buttonLabel ?? 'Choose File'}
        </Button>
    </Box>
  );
}

export default LoadSchemaButton;

//Button that accepts the props from LoadSchemaButtonProps and allows the user 
//to load a JSON file containing the schema.

