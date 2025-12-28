// src/components/RelatedDocuments.js

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Drawer,
  Button,
  TextField,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Toolbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import { API_BASE_URL } from '../config';

const DRAWER_WIDTH = 350;

const RelatedDocuments = ({ documents, setDocuments, isManager, projectId, userName, userRole, isEditing, open, onClose }) => {
  const [editingDoc, setEditingDoc] = useState(null);
  const [newDocName, setNewDocName] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [newDocIsLocal, setNewDocIsLocal] = useState(false);

  const handleAddNew = () => {
    setEditingDoc({ id: 'new', name: '', url: '', is_local_file: false });
    setNewDocName('');
    setNewDocUrl('');
    setNewDocIsLocal(false);
  };

  const handleCancelEdit = () => {
    setEditingDoc(null);
    setNewDocName('');
    setNewDocUrl('');
    setNewDocIsLocal(false);
  };

  const handleSaveNew = () => {
    if (!newDocName.trim() || !newDocUrl.trim()) {
      return;
    }
    const newDoc = {
      id: 'new',
      name: newDocName.trim(),
      url: newDocUrl.trim(),
      is_local_file: newDocIsLocal,
      order_index: documents.length,
    };
    if (setDocuments) {
      setDocuments([...documents, newDoc]);
    }
    setEditingDoc(null);
    setNewDocName('');
    setNewDocUrl('');
    setNewDocIsLocal(false);
  };

  const handleDelete = (docId) => {
    if (setDocuments) {
      setDocuments(documents.filter(doc => doc.id !== docId));
    }
  };

  const handleEdit = (doc) => {
    setEditingDoc(doc);
    setNewDocName(doc.name);
    setNewDocUrl(doc.url);
    setNewDocIsLocal(doc.is_local_file);
  };

  const handleSaveEdit = () => {
    if (!newDocName.trim() || !newDocUrl.trim()) {
      return;
    }
    if (setDocuments) {
      setDocuments(documents.map(doc =>
        doc.id === editingDoc.id
          ? { ...doc, name: newDocName.trim(), url: newDocUrl.trim(), is_local_file: newDocIsLocal }
          : doc
      ));
    }
    setEditingDoc(null);
    setNewDocName('');
    setNewDocUrl('');
    setNewDocIsLocal(false);
  };

  const handleLinkClick = (doc) => {
    if (doc.is_local_file) {
      // For local files, use the API endpoint
      const fileUrl = `${API_BASE_URL}/api/files/${encodeURIComponent(doc.url)}`;
      window.open(fileUrl, '_blank');
    } else {
      // For URLs, open directly
      window.open(doc.url, '_blank');
    }
  };

  const getDocumentUrl = (doc) => {
    if (doc.is_local_file) {
      return `${API_BASE_URL}/api/files/${encodeURIComponent(doc.url)}`;
    }
    return doc.url;
  };

  // Use documents prop directly
  const displayDocuments = documents;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: '#1e1e1e',
          borderLeft: '1px solid #444',
        },
      }}
    >
      <Toolbar sx={{ backgroundColor: '#2d2d2d', justifyContent: 'center', minHeight: '64px !important', position: 'relative' }}>
        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 'bold', textAlign: 'center' }}>
          מסמכים קשורים
        </Typography>
        <IconButton 
          onClick={onClose} 
          sx={{ 
            color: '#fff', 
            position: 'absolute', 
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        >
          <CloseIcon />
        </IconButton>
      </Toolbar>
      <Divider sx={{ borderColor: '#444' }} />
      <Box sx={{ p: 2, backgroundColor: '#1e1e1e', height: '100%', overflow: 'auto' }}>
        {displayDocuments.length === 0 && !isEditing && (
          <Typography sx={{ color: '#888', textAlign: 'center', py: 2 }}>
            אין מסמכים קשורים
          </Typography>
        )}

        {displayDocuments.length > 0 && (
          <List sx={{ direction: 'rtl' }}>
            {displayDocuments.map((doc) => (
              <ListItem
                key={doc.id}
                sx={{
                  border: '1px solid #444',
                  borderRadius: 1,
                  mb: 1,
                  backgroundColor: '#2d2d2d',
                  '&:hover': { backgroundColor: '#333' },
                }}
              >
                {isEditing && isManager && editingDoc && editingDoc.id === doc.id ? (
                  <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <TextField
                      label="שם"
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      size="small"
                      fullWidth
                      sx={{ 
                        '& .MuiInputBase-input': { color: '#fff' },
                        '& .MuiInputLabel-root': { color: '#aaa' },
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: '#555' },
                        },
                      }}
                    />
                    <TextField
                      label="קישור או נתיב קובץ"
                      value={newDocUrl}
                      onChange={(e) => setNewDocUrl(e.target.value)}
                      size="small"
                      fullWidth
                      sx={{ 
                        '& .MuiInputBase-input': { color: '#fff' },
                        '& .MuiInputLabel-root': { color: '#aaa' },
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': { borderColor: '#555' },
                        },
                      }}
                    />
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Button
                        size="small"
                        variant={newDocIsLocal ? 'contained' : 'outlined'}
                        onClick={() => setNewDocIsLocal(true)}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        קובץ מקומי
                      </Button>
                      <Button
                        size="small"
                        variant={!newDocIsLocal ? 'contained' : 'outlined'}
                        onClick={() => setNewDocIsLocal(false)}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        כתובת URL
                      </Button>
                      <Box sx={{ flexGrow: 1 }} />
                      <IconButton
                        onClick={handleSaveEdit}
                        disabled={!newDocName.trim() || !newDocUrl.trim()}
                        sx={{ color: '#4caf50' }}
                      >
                        <SaveIcon />
                      </IconButton>
                      <IconButton onClick={handleCancelEdit} sx={{ color: '#f44336' }}>
                        <CancelIcon />
                      </IconButton>
                    </Box>
                  </Box>
                ) : (
                  <>
                    <ListItemText
                      primary={
                        <Link
                          href={getDocumentUrl(doc)}
                          onClick={(e) => {
                            e.preventDefault();
                            handleLinkClick(doc);
                          }}
                          sx={{
                            color: '#1976d2',
                            cursor: 'pointer',
                            textDecoration: 'none',
                            '&:hover': { textDecoration: 'underline' },
                            display: 'block',
                            textAlign: 'center',
                          }}
                        >
                          {doc.name}
                        </Link>
                      }
                      sx={{ direction: 'rtl', textAlign: 'center' }}
                    />
                    {isEditing && isManager && (
                      <ListItemSecondaryAction sx={{ left: 8, right: 'auto' }}>
                        <IconButton
                          edge="end"
                          onClick={() => handleEdit(doc)}
                          sx={{ color: '#ffa500', mr: 1 }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          edge="end"
                          onClick={() => handleDelete(doc.id)}
                          sx={{ color: '#f44336' }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    )}
                  </>
                )}
              </ListItem>
            ))}
          </List>
        )}

        {isEditing && isManager && !editingDoc && (
          <Box sx={{ mt: 2 }}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddNew}
              sx={{ color: '#fff', borderColor: '#555', '&:hover': { borderColor: '#777' } }}
            >
              הוסף מסמך
            </Button>
          </Box>
        )}

        {isEditing && isManager && editingDoc && editingDoc.id === 'new' && (
          <Box sx={{ mt: 2, p: 2, border: '1px solid #555', borderRadius: 1, backgroundColor: '#2d2d2d' }}>
            <TextField
              label="שם"
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              size="small"
              fullWidth
              sx={{ 
                mb: 1,
                '& .MuiInputBase-input': { color: '#fff' },
                '& .MuiInputLabel-root': { color: '#aaa' },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#555' },
                },
              }}
            />
            <TextField
              label="קישור או נתיב קובץ"
              value={newDocUrl}
              onChange={(e) => setNewDocUrl(e.target.value)}
              size="small"
              fullWidth
              sx={{ 
                mb: 1,
                '& .MuiInputBase-input': { color: '#fff' },
                '& .MuiInputLabel-root': { color: '#aaa' },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#555' },
                },
              }}
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
              <Button
                size="small"
                variant={newDocIsLocal ? 'contained' : 'outlined'}
                onClick={() => setNewDocIsLocal(true)}
                sx={{ fontSize: '0.75rem' }}
              >
                קובץ מקומי
              </Button>
              <Button
                size="small"
                variant={!newDocIsLocal ? 'contained' : 'outlined'}
                onClick={() => setNewDocIsLocal(false)}
                sx={{ fontSize: '0.75rem' }}
              >
                כתובת URL
              </Button>
              <Box sx={{ flexGrow: 1 }} />
              <IconButton
                onClick={handleSaveNew}
                disabled={!newDocName.trim() || !newDocUrl.trim()}
                sx={{ color: '#4caf50' }}
              >
                <SaveIcon />
              </IconButton>
              <IconButton onClick={handleCancelEdit} sx={{ color: '#f44336' }}>
                <CancelIcon />
              </IconButton>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default RelatedDocuments;

