const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Builds a WHERE-clause fragment + params filtering parcel_shipments.shipped_date,
// either by an explicit [startDate, endDate] range (inclusive of both days) or by the
// existing rolling "last N days" window — mirrors the two modes the frontend's
// date-range selector can produce (a preset day count, or Custom Range).
function buildShippedDateFilter(query) {
  if (query.startDate && query.endDate && DATE_REGEX.test(query.startDate) && DATE_REGEX.test(query.endDate)) {
    return {
      // Dates are Pacific calendar days (warehouse + team timezone); the DB session runs in UTC,
      // so a bare ::date would split days at 4pm/5pm PT. AT TIME ZONE handles DST.
      whereClause: `shipped_date >= ($1::date::timestamp AT TIME ZONE 'America/Los_Angeles')
                AND shipped_date < (($2::date + 1)::timestamp AT TIME ZONE 'America/Los_Angeles')`,
      params: [query.startDate, query.endDate]
    };
  }
  const daysBack = Math.min(parseInt(query.days) || 7, 90);
  return {
    whereClause: `shipped_date >= now() - ($1 || ' days')::interval`,
    params: [daysBack]
  };
}

module.exports = { buildShippedDateFilter };
