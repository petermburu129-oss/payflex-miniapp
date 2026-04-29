// Firebase configuration
const firebaseConfig = {
  // You'll need to get these from Firebase Console
  // Go to Project Settings → General → Your apps → Web app
  // If you don't see a Web app, click "</>" to create one
  apiKey: "AIzaSyBd42B4wr3nfvRC1KrLyNInzrnlCuad4XI",
  authDomain: "payflex-app-8fbbb.firebaseapp.com",
  projectId: "payflex-app-8fbbb",
  storageBucket: "payflex-app-8fbbb.firebasestorage.app",
  messagingSenderId: "717097363709",
  appId: "1:717097363709:web:8cb6964ae81ae5f40e7694"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();