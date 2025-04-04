import { v4 as uuidv4 } from 'uuid';

export class MovieClass {
  private movie_obj: { movies: any[] };

  constructor() {
    this.movie_obj = { movies: [] };
  }

  addMovie(
    movie_title: string,
    movie_image: string,
    movie_page_link: string,
    movie_second_title: string,
  ): void {
    // 過濾掉相同標題的電影
    const new_arr = this.movie_obj.movies.filter((x) => x.m_t !== movie_title);

    // 在數組前端插入新電影
    new_arr.push({
      m_idx: uuidv4(),
      m_t: movie_title,
      m_img: movie_image,
      m_p_l: movie_page_link,
      m_s_t: movie_second_title,
    });

    this.movie_obj.movies = new_arr;
  }

  dictToJson(): string {
    return JSON.stringify(this.movie_obj);
  }

  getMovieCount(): number {
    return this.movie_obj.movies.length;
  }

  getMovies(): any[] {
    return this.movie_obj.movies;
  }
}
