export type FeedConfig = {
  id: string;
  name: string;
  url?: string;
  localPath?: string;
};

export const FEEDS: FeedConfig[] = [
  {
    id: "ttc",
    name: "TTC",
    // Surface GTFS aligns with bustime GTFS-RT; merged feed stop_ids can drift.
    url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/bd4809dd-e289-4de8-bbde-c5c00dafbf4f/resource/28514055-d011-4ed7-8bb0-97961dfe2b66/download/SurfaceGTFS.zip",
  },
  {
    id: "go",
    name: "GO Transit",
    url: "https://assets.metrolinx.com/raw/upload/v1683228856/Documents/Metrolinx/Open%20Data/GO-GTFS.zip",
  },
  {
    id: "miway",
    name: "MiWay",
    url: "https://www.miapp.ca/GTFS/google_transit.zip",
  },
  {
    id: "brampton",
    name: "Brampton Transit",
    url: "https://geohub.brampton.ca/api/download/v1/items/a355aabd5a8c490186bdce559c9c75fb/public/GTFS.zip",
  },
  {
    id: "drt",
    name: "Durham Region Transit",
    url: "https://maps.durham.ca/OpenDataGTFS/GTFS_Durham_TX.zip",
  },
  {
    id: "yrt",
    name: "YRT / Viva",
    localPath: process.env.YRT_GTFS_ZIP,
  },
];
