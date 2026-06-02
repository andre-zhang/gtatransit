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
    url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/TTC%20Routes%20and%20Schedules%20Data.zip",
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
