import React, { useState } from 'react';
import Modal from '@mui/material/Modal';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

interface ModalProps {
  title: string;
  content: string;
  open: boolean;
  handleClose: () => void;
}

const ModalComponent: React.FC<ModalProps> = ({ title, content, open, handleClose }) => {  

  return (
    <Modal
      open={open}
      onClose={handleClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
    >
      <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, bgcolor: 'background.paper', boxShadow: 24, p: 4 }}>
	  	<Typography id="modal-modal-title" variant="h6" component="h2" style={{ color: 'red' }} dangerouslySetInnerHTML={{ __html: title }} />
        <Typography id="modal-modal-description" sx={{ mt: 2 }} style={{ color: 'red' }} dangerouslySetInnerHTML={{ __html: content }} />

        <Button onClick={handleClose}>Close</Button>
      </Box>
    </Modal>
  );
};

export default ModalComponent;
