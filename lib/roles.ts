import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
} from "firebase/firestore";

export type Role = "admin" | "viewer";

export interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  photoURL?: string;
}

export async function getUserRole(uid: string): Promise<Role> {
  const { getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, "users", uid));
  return (snap.data()?.role as Role) ?? "viewer";
}

export async function hasAnyAdmin(): Promise<boolean> {
  const q = query(collection(db, "users"), where("role", "==", "admin"));
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function listUsers(): Promise<UserRecord[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({
    uid: d.id,
    email: d.data().email ?? "",
    displayName: d.data().displayName ?? "",
    role: (d.data().role as Role) ?? "viewer",
    photoURL: d.data().photoURL ?? "",
  }));
}

export async function setUserRole(uid: string, role: Role): Promise<void> {
  await updateDoc(doc(db, "users", uid), { role });
}
