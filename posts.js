import { db, auth } from "./firebase.js";

import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
  deleteDoc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";


// =====================================================
// ALQLIC PERSONALIZED POSTS FEED
// =====================================================

let postsContainer;
let allPosts = [];
let followingIds = new Set();

let unsubscribePosts = null;
let unsubscribeFollowing = null;


// =====================================================
// FEED TIME SETTINGS
// =====================================================

// Your own posts appear on your dashboard for 5 days.
const OWN_POST_DAYS = 5;

// Posts from people you follow appear for 3 days.
const FOLLOWING_POST_DAYS = 3;

const DAY_IN_MS =
  24 * 60 * 60 * 1000;


// =====================================================
// INITIALIZE
// =====================================================

window.addEventListener(
  "DOMContentLoaded",
  () => {

    postsContainer =
      document.getElementById(
        "postsContainer"
      );

    if (!postsContainer) {

      console.error(
        "❌ Posts container not found."
      );

      return;

    }

    console.log(
      "✅ Posts container connected."
    );


    startPersonalizedFeed();

  }
);


// =====================================================
// START PERSONALIZED FEED
// =====================================================

function startPersonalizedFeed() {

  onAuthStateChanged(
    auth,
    (user) => {

      // Stop previous listeners when
      // authentication changes.
      if (unsubscribePosts) {

        unsubscribePosts();
        unsubscribePosts = null;

      }

      if (unsubscribeFollowing) {

        unsubscribeFollowing();
        unsubscribeFollowing = null;

      }


      if (!user) {

        followingIds.clear();
        allPosts = [];

        postsContainer.innerHTML = `
          <div class="empty-feed">
            <p>
              Please log in to see your
              personalized feed.
            </p>
          </div>
        `;

        return;

      }


      console.log(
        "✅ Feed user:",
        user.uid
      );


      // Listen to following changes.
      listenToFollowing(
        user.uid
      );


      // Listen to posts.
      listenToPosts();

    }
  );

}


// =====================================================
// LISTEN TO FOLLOWING
// =====================================================

function listenToFollowing(userId) {

  const followingRef =
    collection(
      db,
      "users",
      userId,
      "following"
    );


  unsubscribeFollowing =
    onSnapshot(
      followingRef,
      (snapshot) => {

        followingIds.clear();


        snapshot.forEach(
          (followDoc) => {

            // The document ID is the UID
            // of the person being followed.
            followingIds.add(
              followDoc.id
            );

          }
        );


        console.log(
          "✅ Following list updated:",
          followingIds.size
        );


        renderPersonalizedFeed();

      },
      (error) => {

        console.error(
          "❌ Following listener error:",
          error
        );

      }
    );

}


// =====================================================
// LISTEN TO POSTS
// =====================================================

function listenToPosts() {

  const postsQuery =
    query(
      collection(
        db,
        "posts"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    );


  unsubscribePosts =
    onSnapshot(
      postsQuery,
      (snapshot) => {

        allPosts = [];


        snapshot.forEach(
          (postDoc) => {

            allPosts.push({

              id:
                postDoc.id,

              ...postDoc.data()

            });

          }
        );


        console.log(
          "✅ Posts updated:",
          allPosts.length
        );


        renderPersonalizedFeed();

      },
      (error) => {

        console.error(
          "❌ Feed error:",
          error
        );

      }
    );

}


// =====================================================
// BUILD PERSONALIZED FEED
// =====================================================

function renderPersonalizedFeed() {

  const currentUser =
    auth.currentUser;


  if (
    !currentUser ||
    !postsContainer
  ) {

    return;

  }


  const now =
    Date.now();


  const ownPostLimit =
    OWN_POST_DAYS *
    DAY_IN_MS;


  const followingPostLimit =
    FOLLOWING_POST_DAYS *
    DAY_IN_MS;


  // ===================================================
  // FILTER POSTS
  // ===================================================

  const eligiblePosts =
    allPosts.filter(
      (post) => {

        // A post must have a completed
        // Firestore timestamp.
        if (
          !post.createdAt ||
          !post.createdAt.seconds
        ) {

          return false;

        }


        const postTime =
          post.createdAt.seconds *
          1000;


        const postAge =
          now -
          postTime;


        // Ignore invalid future dates.
        if (
          postAge < 0
        ) {

          return false;

        }


        // -----------------------------------------------
        // USER'S OWN POSTS
        // Show for up to 5 days.
        // -----------------------------------------------

        if (
          post.userId ===
          currentUser.uid
        ) {

          return (
            postAge <=
            ownPostLimit
          );

        }


        // -----------------------------------------------
        // FOLLOWED USERS' POSTS
        // Show for up to 3 days.
        // -----------------------------------------------

        if (
          followingIds.has(
            post.userId
          )
        ) {

          return (
            postAge <=
            followingPostLimit
          );

        }


        // Do not show ordinary posts
        // from users who are not followed.
        return false;

      }
    );


  // ===================================================
  // SHUFFLE THE FEED
  // ===================================================

  const shuffledPosts =
    shufflePosts(
      [...eligiblePosts]
    );


  postsContainer.innerHTML =
    "";


  // ===================================================
  // EMPTY FEED
  // ===================================================

  if (
    shuffledPosts.length === 0
  ) {

    postsContainer.innerHTML = `
      <div class="empty-feed">
        <p>
          No recent posts yet.
          Follow people or create a post
          to build your feed.
        </p>
      </div>
    `;

    return;

  }


  // ===================================================
  // RENDER POSTS
  // ===================================================

  shuffledPosts.forEach(
    (post) => {

      renderPost(
        post
      );

    }
  );


  console.log(
    "✅ Personalized feed displayed:",
    shuffledPosts.length
  );

}


// =====================================================
// SHUFFLE POSTS
// =====================================================

function shufflePosts(posts) {

  for (
    let i =
      posts.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() *
        (i + 1)
      );


    [
      posts[i],
      posts[j]
    ] =
    [
      posts[j],
      posts[i]
    ];

  }


  return posts;

}


// =====================================================
// RENDER SINGLE POST
// =====================================================

async function renderPost(post) {

  let profileName =
    post.username ||
    "User";


  let profilePhoto =
    post.photoURL ||
    "images/default-avatar.png";


  // ===================================================
  // LOAD CURRENT PROFILE INFORMATION
  // ===================================================

  if (
    post.userId
  ) {

    try {

      const userSnap =
        await getDoc(
          doc(
            db,
            "users",
            post.userId
          )
        );


      if (
        userSnap.exists()
      ) {

        const userData =
          userSnap.data();


        profileName =
          userData.name ||
          profileName;


        profilePhoto =
          userData.photoURL ||
          profilePhoto;

      }

    } catch (error) {

      console.error(
        "Profile loading error:",
        error
      );

    }

  }


  // ===================================================
  // DATE
  // ===================================================

  const createdAt =
    post.createdAt?.seconds
      ? new Date(
          post.createdAt.seconds *
          1000
        ).toLocaleDateString(
          "en-US",
          {
            month: "short",
            day: "2-digit",
            year: "numeric"
          }
        )
      : "";


  // ===================================================
  // MEDIA
  // ===================================================

  let mediaHTML =
    "";


  if (
    Array.isArray(
      post.media
    ) &&
    post.media.length > 0
  ) {

    mediaHTML =
      `<div class="post-media">`;


    post.media.forEach(
      (item) => {

        if (
          item.type ===
          "video"
        ) {

          mediaHTML += `
            <video
              src="${item.url}"
              controls
              preload="metadata"
            ></video>
          `;

        } else {

          mediaHTML += `
            <img
              src="${item.url}"
              alt="Post media"
              loading="lazy"
            >
          `;

        }

      }
    );


    mediaHTML +=
      `</div>`;

  }


  // ===================================================
  // CREATE POST ELEMENT
  // ===================================================

  const div =
    document.createElement(
      "div"
    );


  div.className =
    "post";


  div.innerHTML = `

<div class="post-header">

  <img
    src="${escapeHTML(profilePhoto)}"
    class="post-avatar view-profile"
    data-uid="${post.userId}"
    alt="${escapeHTML(profileName)}"
  >

  <div class="post-user-info">

    <span
      class="post-user view-profile"
      data-uid="${post.userId}"
    >
      ${escapeHTML(profileName)}
    </span>

    <br>

    <small class="post-time">
      ${createdAt}
    </small>

  </div>

  ${
    auth.currentUser &&
    auth.currentUser.uid !==
    post.userId
      ? `
        <button
          class="follow-btn"
          data-uid="${post.userId}"
        >
          ${
            followingIds.has(
              post.userId
            )
              ? "Following"
              : "Follow"
          }
        </button>
      `
      : ""
  }

  <button
    class="post-options-btn"
    data-id="${post.id}"
    type="button"
    aria-label="Post options"
  >
    ⋮
  </button>

</div>

${
  post.content
    ? `
      <p>
        ${escapeHTML(
          post.content
        )}
      </p>
    `
    : ""
}

${mediaHTML}

<div class="post-actions">

  <button
    class="like-btn"
    data-id="${post.id}"
  >
    ❤️ ${post.likes || 0}
  </button>

  <button
    class="comment-btn"
    data-id="${post.id}"
  >
    💬 ${post.comments || 0}
  </button>

  <button
    class="share-btn"
    data-id="${post.id}"
  >
    🔄
  </button>

</div>
`;


  // Prevent an old asynchronous profile
  // lookup from adding a post after
  // the feed has already refreshed.
  if (
    postsContainer
  ) {

    postsContainer.appendChild(
      div
    );

  }

}


// =====================================================
// COMMENTS
// =====================================================

document.addEventListener(
  "click",
  (e) => {

    if (
      !e.target.classList.contains(
        "comment-btn"
      )
    ) {

      return;

    }


    const postId =
      e.target.dataset.id;


    if (!postId) {

      console.error(
        "No post ID found for comment button"
      );

      return;

    }


    window.location.href =
      `comments.html?postId=${postId}`;

  }
);


// =====================================================
// LIKE POST
// =====================================================

document.addEventListener(
  "click",
  async (e) => {

    if (
      !e.target.classList.contains(
        "like-btn"
      )
    ) {

      return;

    }


    const user =
      auth.currentUser;


    if (!user) {

      alert(
        "Please login first"
      );

      return;

    }


    const postId =
      e.target.dataset.id;


    const likeRef =
      doc(
        db,
        "posts",
        postId,
        "likes",
        user.uid
      );


    try {

      const existingLike =
        await getDoc(
          likeRef
        );


      if (
        existingLike.exists()
      ) {

        await deleteDoc(
          likeRef
        );


        await updateDoc(
          doc(
            db,
            "posts",
            postId
          ),
          {
            likes:
              increment(-1)
          }
        );

      } else {

        await setDoc(
          likeRef,
          {
            userId:
              user.uid,
            createdAt:
              Date.now()
          }
        );


        await updateDoc(
          doc(
            db,
            "posts",
            postId
          ),
          {
            likes:
              increment(1)
          }
        );


        const postDocSnap =
          await getDoc(
            doc(
              db,
              "posts",
              postId
            )
          );


        if (
          postDocSnap.exists()
        ) {

          const postData =
            postDocSnap.data();


          if (
            postData.userId !==
            user.uid
          ) {

            await addDoc(
              collection(
                db,
                "notifications"
              ),
              {
                userId:
                  postData.userId,
                senderId:
                  user.uid,
                type:
                  "like",
                postId:
                  postId,
                createdAt:
                  serverTimestamp(),
                read:
                  false
              }
            );

          }

        }

      }

    } catch (error) {

      console.error(
        "Like error:",
        error
      );

    }

  }
);


// =====================================================
// DELETE POST
// =====================================================

document.addEventListener(
  "click",
  async (e) => {

    if (
      !e.target.classList.contains(
        "delete-btn"
      )
    ) {

      return;

    }


    const postId =
      e.target.dataset.id;


    const confirmed =
      confirm(
        "Are you sure you want to delete this post?"
      );


    if (!confirmed) {

      return;

    }


    try {

      await deleteDoc(
        doc(
          db,
          "posts",
          postId
        )
      );


      console.log(
        "✅ Post deleted"
      );

    } catch (error) {

      console.error(
        "DELETE ERROR:",
        error
      );

    }

  }
);


// =====================================================
// VIEW PROFILE
// =====================================================

document.addEventListener(
  "click",
  (e) => {

    if (
      !e.target.classList.contains(
        "view-profile"
      )
    ) {

      return;

    }


    const uid =
      e.target.dataset.uid;


    window.location.href =
      `user.html?uid=${uid}`;

  }
);


// =====================================================
// SHARE POST
// =====================================================

document.addEventListener(
  "click",
  (e) => {

    if (
      !e.target.classList.contains(
        "share-btn"
      )
    ) {

      return;

    }


    const postId =
      e.target.dataset.id;


    if (!postId) {

      console.error(
        "No post ID found for share button"
      );

      return;

    }


    window.location.href =
      `share-post.html?id=${encodeURIComponent(postId)}`;

  }
);


// =====================================================
// FOLLOW / UNFOLLOW
// =====================================================

document.addEventListener(
  "click",
  async (e) => {

    if (
      !e.target.classList.contains(
        "follow-btn"
      )
    ) {

      return;

    }


    const currentUser =
      auth.currentUser;


    if (!currentUser) {

      alert(
        "Please login first"
      );

      return;

    }


    const targetUid =
      e.target.dataset.uid;


    if (
      targetUid ===
      currentUser.uid
    ) {

      return;

    }


    try {

      const followingRef =
        doc(
          db,
          "users",
          currentUser.uid,
          "following",
          targetUid
        );


      const followerRef =
        doc(
          db,
          "users",
          targetUid,
          "followers",
          currentUser.uid
        );


      const followingSnap =
        await getDoc(
          followingRef
        );


      if (
        followingSnap.exists()
      ) {

        // UNFOLLOW

        await deleteDoc(
          followingRef
        );


        await deleteDoc(
          followerRef
        );


        followingIds.delete(
          targetUid
        );


        e.target.textContent =
          "Follow";


        // Refresh feed immediately.
        renderPersonalizedFeed();

      } else {

        // FOLLOW

        await setDoc(
          followingRef,
          {
            userId:
              targetUid,
            createdAt:
              serverTimestamp()
          }
        );


        await setDoc(
          followerRef,
          {
            userId:
              currentUser.uid,
            createdAt:
              serverTimestamp()
          }
        );


        await addDoc(
          collection(
            db,
            "notifications"
          ),
          {
            userId:
              targetUid,
            senderId:
              currentUser.uid,
            type:
              "follow",
            createdAt:
              serverTimestamp(),
            read:
              false
          }
        );


        followingIds.add(
          targetUid
        );


        e.target.textContent =
          "Following";


        // Refresh feed immediately.
        renderPersonalizedFeed();

      }

    } catch (error) {

      console.error(
        "Follow error:",
        error
      );

    }

  }
);


// =====================================================
// POST OPTIONS
// =====================================================

document.addEventListener(
  "click",
  (e) => {

    if (
      !e.target.classList.contains(
        "post-options-btn"
      )
    ) {

      return;

    }


    const postId =
      e.target.dataset.id;


    window.location.href =
      `post-options.html?id=${encodeURIComponent(postId)}`;

  }
);


// =====================================================
// SECURITY
// =====================================================

function escapeHTML(str) {

  return String(str)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}
