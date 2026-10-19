// The spreadsheet library is large (roughly half of the app's JavaScript) and is
// only needed when someone taps "Export". Loading it on demand keeps it out of
// the code every visitor downloads at start-up.
export const loadXlsx = () => import('xlsx')
