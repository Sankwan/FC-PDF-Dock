/**
 * Forestry Commission details used by the letterhead tool and the
 * stamps. Contact lines are the defaults the Letterhead tool starts from;
 * staff can edit them before applying, and the tool remembers their edits on
 * that device.
 *
 * Sources: the Wildlife Division lines are copied from a current printed
 * letterhead supplied by FC staff. The other divisions' lines come from
 * public directories (see docs/fc-staff-rollout-review.html) and are marked
 * `confirmed: false` until the division confirms them; the tool shows a
 * "check these details" note for those.
 */

export const ORG = {
  name: "Forestry Commission",
  country: "Ghana",
  ministry: "Ministry of Lands and Natural Resources",
  website: "fc.gov.gh",
  headOffice: "No. 4 Third Avenue, Ridge, Accra",
  vision:
    "To leave future generation and their communities with richer, better, more valuable forestry and wildlife endowments than we inherited.",
};

export interface DivisionLetterhead {
  id: string;
  /** Printed under "FORESTRY COMMISSION" in brackets, e.g. (WILDLIFE DIVISION). Empty for the corporate head office. */
  subtitle: string;
  label: string;
  /** Short code used in file references and the Received stamp. */
  code: string;
  lines: string[];
  confirmed: boolean;
}

export const DIVISIONS: DivisionLetterhead[] = [
  {
    id: "hq",
    label: "Corporate Head Office",
    code: "FC",
    subtitle: "",
    lines: ["NO. 4 THIRD AVENUE, RIDGE · P. O. BOX MB 434, ACCRA, GHANA", "TEL: (233-0302) 401210 / 401227 / 401216", "WEBSITE: www.fc.gov.gh"],
    confirmed: false,
  },
  {
    id: "fsd",
    label: "Forest Services Division",
    code: "FSD",
    subtitle: "FOREST SERVICES DIVISION",
    lines: ["P. O. BOX GP 257, ACCRA, GHANA", "TEL: (233-0302) 401210 / 401227 / 401216", "WEBSITE: www.fc.gov.gh"],
    confirmed: false,
  },
  {
    id: "wd",
    label: "Wildlife Division",
    code: "WD",
    subtitle: "WILDLIFE DIVISION",
    lines: [
      "P. O. BOX MB 239, ACCRA, GHANA",
      "TEL: (233-0302) 401210 / 401227 / 401216 / 401231 / 401249",
      "FAX: (233-0302) 401179",
      "E-MAIL: info_wd@hq.fcghana.com",
    ],
    confirmed: true,
  },
  {
    id: "tidd",
    label: "Timber Industry Development Division",
    code: "TIDD",
    subtitle: "TIMBER INDUSTRY DEVELOPMENT DIVISION",
    lines: ["ADDRESS LINE (to be confirmed)", "TEL: (to be confirmed)", "WEBSITE: www.fc.gov.gh"],
    confirmed: false,
  },
  {
    id: "rmsc",
    label: "Resource Management Support Centre",
    code: "RMSC",
    subtitle: "RESOURCE MANAGEMENT SUPPORT CENTRE",
    lines: ["P. O. BOX 1457, KUMASI, GHANA", "TEL: (233-03220) 28525", "WEBSITE: www.fc.gov.gh"],
    confirmed: false,
  },
  {
    id: "fctc",
    label: "Forestry Commission Training Centre",
    code: "FCTC",
    subtitle: "FORESTRY COMMISSION TRAINING CENTRE",
    lines: ["AKYAWKROM, EJISU, ASHANTI REGION, GHANA", "TEL: (to be confirmed)", "WEBSITE: www.fc.gov.gh"],
    confirmed: false,
  },
];
