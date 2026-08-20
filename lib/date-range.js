const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Builds a WHERE-clause fragment + params filtering parcel_shipments.shipped_date,
// either by an explicit [startDate, endDate] range (inclusive of both days) or by the
// existing rolling "last N days" window — mirrors the two modes the frontend's
// date-range selector can produce (a preset day count, or Custom Range).
function buildShippedDateFilter(query) {
  if (query.startDate && query.endDate && DATE_REGEX.test(query.startDate) && DATE_REGEX.test(query.endDate)) {
    return {
      whereClause: `shipped_date >= $1::date AND shipped_date < ($2::date + interval '1 day')`,
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
