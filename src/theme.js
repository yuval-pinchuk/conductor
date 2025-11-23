// src/theme.js
import { createTheme } from '@mui/material/styles';
import { red, orange } from '@mui/material/colors';

// Define your custom dark theme
const darkTheme = createTheme({
  palette: {
    // 1. Core Mode: Set to dark
    mode: 'dark',
    
    // 2. Primary Color: Used for main UI elements (Buttons, Header, etc.)
    primary: {
      main: orange[600], // A vibrant orange for emphasis
      contrastText: '#000', // Black text for contrast
    },
    
    // 3. Secondary Color: Used for accents or secondary actions
    secondary: {
      main: red[700], // A deep red for error/important states
      contrastText: '#fff',
    },
    
    // 4. Background and Surface Colors: Focus on black/dark gray
    background: {
      default: '#000000', // Deep black for the main background
      paper: '#121212',   // Slightly lighter black for cards, tables, etc.
    },
    
    // 5. Text Colors
    text: {
      primary: '#ffffff', // White text against dark backgrounds
      secondary: '#cccccc', // Lighter gray for less emphasis
    },
    
    // 6. Custom Colors (optional, for specific elements)
    status: {
      worked: orange[400],
      notWorked: red[500],
    },
  },
  
  // Custom component styles to ensure black/dark styling
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#121212', // Dark background for the header
          borderBottom: `2px solid ${orange[600]}`, // Orange border for style
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#333333', // Slightly lighter headers for contrast
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#333333', // Darker dividers
        },
      },
    },
    MuiPaper: {
        styleOverrides: {
            root: {
                backgroundColor: '#1e1e1e', // Dark paper background
            }
        }
    }
  }
});

export default darkTheme;