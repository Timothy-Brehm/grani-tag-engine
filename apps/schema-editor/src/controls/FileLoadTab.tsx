import React from 'react';
import { Button, Typography, Box, Divider } from '@mui/material';
import LoadSchemaButton from './LoadSchemaButton';

interface SchemaDataDisplayProps {
  schema: any;
  data: any;
  onSchemaLoaded: (loadedSchema: any) => void;
  onDataLoaded: (loadedData: any) => void;
  onFileHandleCreated?: (handle: FileSystemFileHandle) => void | undefined;
}

const FileLoadTab: React.FC<SchemaDataDisplayProps> = ({ schema, data, onSchemaLoaded, onDataLoaded, onFileHandleCreated }) => {
  return (
    <>
      <div>
        <Typography variant="h4" style={{ marginBottom: '8px' }}>Load Data</Typography>
      </div>
        <Divider style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', flexGrow: 1 }}>
        <div style={{ flexBasis: '50%', display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h5">Schema</Typography><LoadSchemaButton onFileLoaded={onSchemaLoaded} buttonLabel="Load Schema" />
          <Box border={1} borderColor="primary.main" padding={2} minHeight="50vh" flexGrow={1}>
            {schema && (
              <pre style={{ overflow: 'auto' }}>{JSON.stringify(schema, null, 2)}</pre>
            )}
          </Box>
        </div>
        <Divider orientation="vertical" flexItem />
        <div style={{ flexBasis: '50%', display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h5">Data</Typography>
            <LoadSchemaButton onFileLoaded={onDataLoaded} onFileHandleCreated={onFileHandleCreated} buttonLabel="Load Data" />
          <Box border={1} borderColor="primary.main" padding={2} minHeight="50vh" flexGrow={1}>
            {data && (
              <pre style={{ overflow: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>
            )}
          </Box>
        </div>
      </div>
    </>
  );
};

export default FileLoadTab;
