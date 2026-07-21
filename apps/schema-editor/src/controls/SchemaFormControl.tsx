import React, { useEffect, useState } from 'react';
import { Box, TextField, Checkbox, FormControlLabel, Button, Typography } from '@mui/material';
import pluralize from 'pluralize';

import type { Schema } from '@grani/schema-tools';

interface SchemaFormControlProps {
  schema: Schema;
  mvp: string;
  onSubmit?: (data: any) => void;
  onCancel?: (data: any) => void;
}

const SchemaFormControl: React.FC<SchemaFormControlProps> = ({ schema, mvp, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<any>(mvp);
  
  useEffect(() => {
    // Set formData to mvp when mvp changes
    setFormData(mvp);
  }, [mvp]);

  const handleChange = (path: string, value: any, schemaType:string) => {
    if (schemaType === 'number' || schemaType === 'integer') {
      value = value === '' ? null : Number(value);
    }
    // Helper function to set value at path in a nested object
    const setValue = (obj: any, path: string[], value: any) => {
      let current = obj;
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (!(segment in current)) {
          current[segment] = {};
        }
        current = current[segment];
      }
      current[path[path.length - 1]] = value;
    };

    const pathArray = path.split('.');
    setValue(formData, pathArray, value);
    setFormData({ ...formData });
  };

  const renderControl = (key: string, schema: Schema, currentPath: string): JSX.Element => {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;

    // Handle 'const' values without rendering a form control
    if ('const' in schema) {
      return <Typography key={fullPath}>{key}: {schema.const}</Typography>;
    }

    const defaultValue = (() => {
      // Use lodash's get or a similar approach to safely access nested values
      const getNestedValue = (obj: any, path: string) => path.split('.').reduce((acc, part) => acc && acc[part], obj);
      return getNestedValue(formData, fullPath) || schema.default || '';
    })();

    switch (schema.type) {
      case 'string':
      case 'number':
      case 'integer':
        return (
          <TextField
            key={fullPath}
            label={key}
            type={schema.type === 'string' ? 'text' : 'number'}
            defaultValue={schema.default || (schema.type === 'string' ? '' : 0)}
            onChange={(e) => handleChange(fullPath, e.target.value, schema.type)}
            variant="outlined"
            fullWidth
            margin="dense"
          />
        );
      case 'boolean':
        return (
          <FormControlLabel
            key={fullPath}
            control={<Checkbox defaultChecked={schema.default === 'true'} 
              onChange={(e) => handleChange(fullPath, e.target.checked, schema.type)} />}
            label={key}
          />
        );
      case 'object':
        return (
          <Box key={fullPath} margin={2} border={1} borderRadius={2} padding={2}>
            <Typography variant="h6">{key}</Typography>
            {schema.properties && Object.keys(schema.properties).map((propKey) =>
              renderControl(propKey, schema.properties![propKey], fullPath)
            )}
          </Box>
        );
      case 'array':
        return <Typography key={fullPath}>Add new {pluralize.plural(key)} after creating the base object</Typography>
      default:
        return <Typography key={fullPath}>Unsupported type: {schema.type}</Typography>;
    }
  };

  return (
    <Box>
      {schema.properties && Object.keys(schema.properties).map((key) =>
        renderControl(key, schema.properties![key], '')
      )}
      <Button variant="contained" color="primary" onClick={() => onSubmit?.(formData)} style={{ marginTop: '20px' }}>
        Submit
      </Button>
      <Button variant="contained" color="primary" onClick={() => onCancel?.(formData)} style={{ marginLeft: '20px', marginTop: '20px' }}>
        Cancel
      </Button>
    </Box>
  );
};

export default SchemaFormControl;
