import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

const COLLECTION = "cip_records";
const FROM_STATUS = "Successful";
const TO_STATUS   = "Approved";
const BATCH_SIZE  = 100;

// GET — audit only: count + 5 sample records with status "Successful"
export async function GET() {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION));
    const matching = snapshot.docs.filter(
      (d) => String(d.data().cipStatus ?? "") === FROM_STATUS
    );

    const sample = matching.slice(0, 5).map((d) => ({
      id:            d.id,
      chrTicketNumbers: d.data().chrTicketNumbers ?? "",
      cipStatus:     d.data().cipStatus ?? "",
      clientName:    d.data().clientName ?? "",
      submissionDate: d.data().submissionDate ?? "",
      lastSyncedAt:  d.data().lastSyncedAt ?? null,
    }));

    return NextResponse.json({
      totalWithSuccessful: matching.length,
      totalRecords:        snapshot.docs.length,
      sample,
      message: `Found ${matching.length} records with status "${FROM_STATUS}". Call POST to this endpoint to migrate them to "${TO_STATUS}".`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// POST — migrate all "Successful" → "Approved" in batches of 100
export async function POST() {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION));
    const matching = snapshot.docs.filter(
      (d) => String(d.data().cipStatus ?? "") === FROM_STATUS
    );

    const total    = matching.length;
    let   migrated = 0;
    const failed:  string[] = [];

    for (let i = 0; i < matching.length; i += BATCH_SIZE) {
      const chunk = matching.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const d of chunk) {
        batch.update(doc(db, COLLECTION, d.id), {
          cipStatus:  TO_STATUS,
          updatedAt:  serverTimestamp(),
        });
      }
      try {
        await batch.commit();
        migrated += chunk.length;
      } catch (err) {
        for (const d of chunk) failed.push(d.id);
      }
    }

    return NextResponse.json({
      total,
      migrated,
      failed,
      message: `Migrated ${migrated} of ${total} records from "${FROM_STATUS}" to "${TO_STATUS}".${
        failed.length ? ` Failed IDs: ${failed.join(", ")}` : ""
      }`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
