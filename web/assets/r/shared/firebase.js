import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, remove, push, onValue, onDisconnect, runTransaction, query, orderByChild, equalTo, limitToLast, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
const firebaseConfig = {
  apiKey: "AIzaSyC3ZsqXpqN26NQy2d5grfDfdQDOqcgpFiA",
  authDomain: "cliff-f4dd9.firebaseapp.com",
  databaseURL: "https://cliff-f4dd9-default-rtdb.firebaseio.com",
  projectId: "cliff-f4dd9",
  storageBucket: "cliff-f4dd9.firebasestorage.app",
  messagingSenderId: "168915112206",
  appId: "1:168915112206:web:874778dbd8cce4092d475f"
};
const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
export {app,auth,db,signInAnonymously,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,ref,get,set,update,remove,push,onValue,onDisconnect,runTransaction,query,orderByChild,equalTo,limitToLast,serverTimestamp};
