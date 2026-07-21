import React from 'react';
import Button from '@mui/material/Button'; // Corrected import for MUI Button

interface SaveToFileProps {
  editedData: any; // Consider specifying a more precise type based on your data structure
  dataFileHandle?: FileSystemFileHandle;
}

const SaveToFile: React.FC<SaveToFileProps> = ({ editedData, dataFileHandle }) => {
  const handleSaveToFile = async () => {
    // If a handle is provided and the API is supported, write directly to the file
    if (dataFileHandle && 'showSaveFilePicker' in window) {
      try {
        console.log("Trying to save using API");
        const writable = await dataFileHandle.createWritable();
        await writable.write(JSON.stringify(editedData, null, 2));
        await writable.close();
        alert('File saved directly.');
      } catch (error) {
        console.error('Failed to save file:', error);
        alert('Failed to save file.');
      }
    } else {
      // Fallback to downloading the file
      const fileData = JSON.stringify(editedData, null, 2);
      const blob = new Blob([fileData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'editedData.json';
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Button variant="contained" onClick={handleSaveToFile}>Save Data to File</Button>
  );
};

export default SaveToFile;
