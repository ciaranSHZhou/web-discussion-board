<template>
  <div class="mx-3 my-3">
    <b-container fluid class="my-4">
      <b-row>
        <b-col xs="12" sm="4">
          <b-card no-body class="mb-3">
            <template #header>
              <div class="d-flex justify-content-between align-items-center">
                Feed
                <b-button class="ml-3" size="sm" @click="refreshPosts"><b-icon-arrow-clockwise /></b-button>
              </div>
            </template>
            <b-list-group flush>
              <b-list-group-item
                v-for="post, i in posts"
                :key="i"
                class="d-flex justify-content-between align-items-center"

              >
              <span @click="selectPost(post)" title="post.id" >{{ post.title }}</span>
              </b-list-group-item>
              <b-list-group-item>
                <b-input-group>
                  <!-- v-model: two way reactivity, connect code implementation and UI -->
                <b-button href="/posting">Create a Post</b-button>
                </b-input-group>
              </b-list-group-item>
            </b-list-group>
          </b-card>
        </b-col>
        <b-col xs="12" sm="8">
          <b-card v-if="selectedPost != null">
            <h2>{{selectedPost?.title}}</h2>
            <div xs="12" sm="3" class="text-muted">by {{selectedPost?.userId}}</div>
           
          </b-card>
          <b-card>

              <div>
              {{selectedPost?.content}}
            </div>
          </b-card>
        </b-col>
      </b-row>
    </b-container>
  </div>
</template>

<script setup lang="ts">
import { onMounted,inject, ref, Ref } from 'vue'
import { getPosts, addList, getPost} from '../data'
import { Post } from "../../../server/data"

const posts: Ref<Post[]> = ref([])
const nameOfListToCreate = ref("")
const modalShow: Ref<any> = ref(false)
const user: Ref<any> = inject("user")!

const selectedPost: Ref<null | Post> = ref(null)// What gets showed on the RH side
const descriptionOfItemToAdd = ref("")

async function refreshPosts() {
  posts.value =  await (await fetch("/api/posts")).json()
}
// create-mount-unmount-destryoed
onMounted(refreshPosts)

async function selectPost(post: Post) {
  selectedPost.value = post
}

async function handleClickAddList() {
  const id = await addList(nameOfListToCreate.value)
  nameOfListToCreate.value = ""
  await refreshPosts()
  await selectPost(id)
}


</script>