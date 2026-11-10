import exec from 'k6/execution';

export interface BookingDates {
  checkin: string;
  checkout: string;
}

export interface Booking {
  firstname: string;
  lastname: string;
  totalprice: number;
  depositpaid: boolean;
  bookingdates: BookingDates;
  additionalneeds?: string;
}

const FIRST_NAMES = ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken'];
const LAST_NAMES = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson'];
const EXTRAS = ['Breakfast', 'Late checkout', 'Parking', 'Airport transfer'];

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

function isoDate(daysFromNow: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

// Every iteration books a unique guest, so a lookup by name finds exactly the booking it created.
export function newBooking(): Booking {
  const nights = 1 + Math.floor(Math.random() * 14);
  const startIn = 1 + Math.floor(Math.random() * 90);
  const suffix = `${exec.vu.idInTest}-${exec.vu.iterationInScenario}`;

  return {
    firstname: pick(FIRST_NAMES),
    lastname: `${pick(LAST_NAMES)}-${suffix}`,
    totalprice: 50 + Math.floor(Math.random() * 950),
    depositpaid: Math.random() < 0.5,
    bookingdates: { checkin: isoDate(startIn), checkout: isoDate(startIn + nights) },
    additionalneeds: pick(EXTRAS),
  };
}
