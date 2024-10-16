//* Constants
const apiRoot = 'https://svc-prod.herohero.co';
const apiUrls = {
  userByPath: function (userPath) {
    return `${apiRoot}/api/v2/users?path=${userPath}`;
  },
  posts: function (userId, pageIndex = 0, pageSize = 20) {
    return `${apiRoot}/api/v2/posts?userId=${userId}&pageIndex=${pageIndex}${pageSize === 20 ? '' : `&pageSize=${pageSize}`}&include=user,categories`
  },
  post: function (postId) {
    return `${apiRoot}/api/v2/posts/${postId}`;
  },
  search: function (query) {
    return `${apiRoot}/api/v2/users?query=${query}`;
  }
}
const platform = { id: 'Herohero', baseUrl: 'https://herohero.co' };

//* Methods
function apiGet(url, use_authenticated = true) {
  const resp = http.GET(
    url,
    {
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.5481.153 Mobile Safari/537.36'
    },
    use_authenticated // use authenticated
  )

  if (!resp.isOk) {
    throw new Error('Response NOT OK')
  }

  return JSON.parse(resp.body)
}

function userToPlatform(userJson) {
  return new PlatformChannel({
    id: new PlatformID(platform.id, userJson.id, config.id),
    name: userJson.attributes.name,
    thumbnail: userJson.attributes.image.id,
    subscribers: userJson.attributes.counts.supporters,
    description: userJson.attributes.bio,
    url: `${platform.baseUrl}/${userJson.attributes.path}`,
    links: [],
  })
}

var config = {}
var settings = {};

//Source Methods
source.enable = function (conf, settings, savedState) {
  // log({ conf, settings });
}

source.getHome = function () {
  return new VideoPager() // TODO: not implemented
}
source.searchSuggestions = function (query) {
  return [] // TODO: not implemented
}
source.getSearchCapabilities = () => {
  return { types: [], sorts: [], filters: [] } // TODO: not implemented
}
source.search = function (query, type, order, filters) {
  return new VideoPager() // TODO: not implemented
}
source.getSearchChannelContentsCapabilities = function () {
  return { types: [], sorts: [], filters: [] } // TODO: not implemented
}
source.searchChannelContents = function (channelUrl, query, type, order, filters) {
  return new ChannelPager() // TODO: not implemented
}
source.searchChannels = function (query) {
  return new SearchChannelsPager({ query, page: 0, page_size: 20 });
}
source.isChannelUrl = function (url) {
  return /herohero\.co\/[a-zA-Z0-9-_]+\/?/.test(url)
}

source.getChannel = function (url) {
  const channelPath = url.split('/').pop();

  const userJson = apiGet(
    apiUrls.userByPath(channelPath),
    false
  ).users[0];

  return userToPlatform(userJson);
}
source.getChannelContents = function (url) {
  return new ChannelVideoPager({ url, page: 0, page_size: 20 })
}

source.getChannelTemplateByClaimMap = () => {
  return {} // TODO: not implemented
};

source.isContentDetailsUrl = function (url) {
  // https://herohero.co/%channel_path%/post/%post_id%
  return /herohero\.co\/[a-zA-Z0-9-_]+\/post\/?/.test(url)
}
source.getContentDetails = function (url) {
  // https://herohero.co/%channel_path%/post/%post_id%
  const splitUrl = url.split('/post/');
  const postId = splitUrl.pop();
  const authorPath = splitUrl.pop().split('/').pop();

  const videoJson = apiGet(
    apiUrls.post(postId)
  );

  const userJson = apiGet(
    apiUrls.userByPath(authorPath)
  ).users[0];

  const mainAsset = videoJson.attributes.assets?.[0]?.gjirafa;

  const thumbnails = [];
  if (mainAsset?.previewStaticUrl) {
    thumbnails.push(new Thumbnail(mainAsset.previewStaticUrl, mainAsset.height));
  }
  videoJson.attributes.assets
    .map((asset) => {
      if (asset.thumbnail) {
        thumbnails.push(new Thumbnail(asset.thumbnail, mainAsset?.height ?? 720));
      }
    })
    .filter((x) => !!x);

  let videoName = videoJson.attributes.text;
  let description = "";
  if (!videoName) {
    videoName = 'Locked content';
  } else if (videoName.includes('\n')) {
    const videoDescArray = videoName.split('\n');
    videoName = videoDescArray.shift();
    description = videoDescArray.join('\n').trim('\n');
  }

  return new PlatformVideoDetails({
    id: new PlatformID(platform.id, videoJson.id, config.id),
    name: videoName,
    thumbnails: new Thumbnails(thumbnails),
    author: new PlatformAuthorLink(
      new PlatformID(platform.id, userJson.id, config.id),
      userJson.attributes.name,
      `${platform.baseUrl}/${userJson.attributes.path}`,
      userJson.attributes.image.id),
    uploadDate: (new Date(videoJson.attributes.publishedAt)).getTime() / 1000,
    duration: mainAsset?.duration ?? 0,
    url,
    isLive: false,
    description,
    video: new VideoSourceDescriptor([
      new HLSSource({
        duration: mainAsset.duration,
        url: mainAsset.videoStreamUrl,
      })
    ]),
    live: null,
    rating: null,
    subtitles: []
  });
}
source.getUserSubscriptions = function () {
  return []; // TODO: not implemented
}
source.getComments = function (url) {
  return new CommentPager([], false, {}) // TODO: not implemented
}
source.getSubComments = function (comment) {
  return new CommentPager([], false, {}) // TODO: not implemented
}
source.getLiveChatWindow = function (url) {
  return null // TODO: not implemented
}
source.getLiveEvents = function (url) {
  return null // TODO: not implemented
}

//* Pagers
class ChannelVideoPager extends VideoPager {
  constructor(context) {
    const channelPath = context.url.split('/').pop();

    const channelJson = apiGet(
      apiUrls.userByPath(channelPath)
    ).users[0];

    const videosJson = apiGet(
      apiUrls.posts(channelJson.id, context.page, context.page_size)
    );

    const videos = videosJson.posts.map((videoData) => {
      const authorUser = videosJson.included.users.find((user) => user.id === videoData.relationships.user.id);
      const mainAsset = videoData.attributes.assets?.[0]?.gjirafa;

      const thumbnails = [];
      if (mainAsset?.previewStaticUrl) {
        thumbnails.push(new Thumbnail(mainAsset.previewStaticUrl, mainAsset.height));
      }
      videoData.attributes.assets
        .map((asset) => {
          if (asset.thumbnail) {
            thumbnails.push(new Thumbnail(asset.thumbnail, mainAsset?.height ?? 720));
          }
          if (asset.image) {
            thumbnails.push(new Thumbnail(asset.image.url, asset.image.height ?? 1080));
          }
        })
        .filter((x) => !!x);

      let videoName = videoData.attributes.text;
      if (!videoName) {
        videoName = 'Locked video';
      } else if (videoName.includes('\n')) {
        videoName = videoName.split('\n')[0];
      }

      // TODO: return PlatformPost if it's not video
      return new PlatformVideo({
        id: new PlatformID(platform.id, videoData.id, config.id),
        name: videoName,
        thumbnails: new Thumbnails(thumbnails),
        author: new PlatformAuthorLink(
          new PlatformID(platform.id, authorUser.id, config.id),
          authorUser.attributes.name,
          `${platform.baseUrl}/${authorUser.attributes.path}`,
          authorUser.attributes.image.id),
        uploadDate: (new Date(videoData.attributes.publishedAt)).getTime() / 1000,
        duration: mainAsset?.duration ?? 0,
        url: `${platform.baseUrl}/${authorUser.attributes.path}/post/${videoData.id}`,
        isLive: false
      });
    });

    super(videos, videosJson.meta.hasNext, context);
  }

  nextPage() {
    this.context.page++
    return new ChannelVideoPager(this.context);
  }
}

class SearchChannelsPager extends ChannelPager {
  constructor(context) {
    const channelsJson = apiGet(
      apiUrls.search(context.query),
      false
    );

    const channels = channelsJson.users.map(userToPlatform);

    super(channels, channelsJson.meta.hasNext, context);
  }

  nextPage() {
    this.context.page++
    return new SearchChannelsPager(this.context);
  }
}

log('LOADED');
