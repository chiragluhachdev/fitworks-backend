import { Request, Response } from "express";
import { InstantLead } from "../models/InstantLead";
import { Trainer } from "../models/Trainer";
import { normalizePhone } from "../utils/phone";

/**
 * Leads captured by Meta instant forms, for the admin Instant Forms screen.
 *
 * Read-only as far as the rest of the platform is concerned: nothing here
 * creates trainers, users or applications. A lead becomes a trainer only by
 * registering on the site themselves.
 */
export const getInstantLeads = async (req: Request, res: Response) => {
  try {
    const leads = await InstantLead.find().sort({ submittedAt: -1, createdAt: -1 });

    // Which of these people have since registered? Matched on phone, which is
    // the one field both sides always have.
    const phones = leads.map((l) => l.phone).filter(Boolean);
    const trainers = await Trainer.find({ "personal.phone": { $in: phones } })
      .select("personal.phone personal.fullName slug verificationStatus");

    const byPhone = new Map(
      trainers.map((t) => [
        t.personal?.phone,
        { slug: t.slug, verificationStatus: t.verificationStatus },
      ])
    );

    const data = leads.map((l) => {
      const registered = byPhone.get(l.phone);
      return { ...l.toObject(), registeredTrainer: registered ?? null };
    });

    const summary = {
      total: data.length,
      registered: data.filter((d) => d.registeredTrainer).length,
      new: data.filter((d) => d.status === "new").length,
      contacted: data.filter((d) => d.status === "contacted").length,
    };

    res.status(200).json({ success: true, summary, data });
  } catch (error: any) {
    console.error("Get Instant Leads Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Bulk import from a Meta leads export.
 *
 * Upserts on Meta's lead id when the export has one, falling back to the phone
 * number, so importing the same file twice updates rows instead of duplicating
 * them. Rows without a usable Indian mobile are skipped and reported back —
 * a lead we cannot contact is not worth storing.
 */
export const importInstantLeads = async (req: Request, res: Response) => {
  try {
    const rows: any[] = Array.isArray(req.body?.leads) ? req.body.leads : [];
    if (!rows.length) {
      return res.status(400).json({ success: false, message: "No rows to import" });
    }

    let imported = 0;
    let updated = 0;
    const skipped: { row: number; reason: string }[] = [];

    for (const [i, row] of rows.entries()) {
      const phone = normalizePhone(row.phone);
      if (!/^[6-9]\d{9}$/.test(phone)) {
        skipped.push({ row: i + 1, reason: `unusable phone: ${row.phone ?? "(blank)"}` });
        continue;
      }

      const doc = {
        fullName: String(row.fullName || "").trim() || "Unnamed lead",
        phone,
        email: row.email ? String(row.email).trim().toLowerCase() : undefined,
        city: row.city ? String(row.city).trim() : undefined,
        leadId: row.leadId ? String(row.leadId) : undefined,
        formName: row.formName ? String(row.formName) : undefined,
        campaignName: row.campaignName ? String(row.campaignName) : undefined,
        platform: row.platform ? String(row.platform) : undefined,
        submittedAt: row.submittedAt ? new Date(row.submittedAt) : undefined,
        raw: row.raw && typeof row.raw === "object" ? row.raw : undefined,
      };

      const filter = doc.leadId ? { leadId: doc.leadId } : { phone: doc.phone };
      const existing = await InstantLead.findOne(filter);

      if (existing) {
        // Never overwrite the status an admin has set by hand.
        await InstantLead.updateOne(filter, { $set: { ...doc, status: existing.status } });
        updated++;
      } else {
        await InstantLead.create(doc);
        imported++;
      }
    }

    res.status(200).json({
      success: true,
      imported,
      updated,
      skipped: skipped.length,
      skippedDetail: skipped.slice(0, 20),
      message: `${imported} added, ${updated} updated, ${skipped.length} skipped`,
    });
  } catch (error: any) {
    console.error("Import Instant Leads Error:", error);
    res.status(500).json({ success: false, message: error?.message || "Server error" });
  }
};

export const updateInstantLead = async (req: Request, res: Response) => {
  try {
    const { status, notes } = req.body;
    const update: Record<string, unknown> = {};
    if (status) {
      if (!["new", "contacted", "registered", "not_interested"].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      update.status = status;
    }
    if (notes !== undefined) update.notes = notes;

    const lead = await InstantLead.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

    res.status(200).json({ success: true, data: lead });
  } catch (error: any) {
    console.error("Update Instant Lead Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const deleteInstantLead = async (req: Request, res: Response) => {
  try {
    const lead = await InstantLead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
    res.status(200).json({ success: true, message: "Lead removed" });
  } catch (error: any) {
    console.error("Delete Instant Lead Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
