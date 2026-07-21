import React, { useEffect, useState } from 'react';
import Snackbar, { SnackbarCloseReason } from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

interface ShowOnceSnackbarAlertProps {
  uniqueMessageKey: string;
  show: boolean;
  message: string;
  severity?: 'error' | 'warning' | 'info' | 'success';
}

const ShowOnceSnackbarAlert: React.FC<ShowOnceSnackbarAlertProps> = ({
  show,
  uniqueMessageKey,
  message,
  severity = 'warning',
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const hash: string = btoa(uniqueMessageKey);
    //const hasShown: string | null = localStorage.getItem(hash);
    const hasShown = false;
    if (show && !hasShown) {
      setOpen(true); // Show the snackbar if it hasn't been shown before
      localStorage.setItem(hash, 'true'); // Mark as shown
    }
  }, [show, uniqueMessageKey]);

  const handleClose = (
    event: React.SyntheticEvent<any, Event> | Event, 
    reason?: SnackbarCloseReason | string
  ) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  };

  return (
    <Snackbar open={open} autoHideDuration={6000} onClose={handleClose} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} >
      <Alert onClose={handleClose} severity={severity} sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  );
};

export default ShowOnceSnackbarAlert;
