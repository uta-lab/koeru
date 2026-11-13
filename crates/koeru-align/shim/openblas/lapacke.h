// Kaldi の `matrix/kaldi-blas.h` が `HAVE_OPENBLAS` のときに引く `"lapacke.h"` の代わり。
//
// LAPACK 3.9 以降の `lapack.h` は、文字を受ける関数に Fortran の隠れた文字列長を
// 末尾の引数として宣言する。Kaldi はそれを渡さないので、そのままでは組めない。
// 省いて呼ぶと、gfortran が組んだ LAPACK はゴミの長さを読みうる。
// vendor を書き換えず、ここで長さ 1 を足して本物の記号へ渡す。
//
// Kaldi が呼ぶ12個だけを置く（`matrix/cblas-wrappers.h`）。 増えたら組めなくなる——それが狙い。
#pragma once
#include <cstddef>

#define KOERU_LAPACK(T, p)                                                        \
  extern "C" void p##getrf_(int*, int*, T*, int*, int*, int*);                    \
  extern "C" void p##getri_(int*, T*, int*, int*, T*, int*, int*);                \
  extern "C" void koeru_##p##tptri_(const char*, const char*, int*, T*, int*,     \
                                    std::size_t, std::size_t) __asm__(#p "tptri_"); \
  extern "C" void koeru_##p##gesvd_(const char*, const char*, int*, int*, T*, int*, \
                                    T*, T*, int*, T*, int*, T*, int*, int*,       \
                                    std::size_t, std::size_t) __asm__(#p "gesvd_"); \
  extern "C" void koeru_##p##sptri_(const char*, int*, T*, int*, T*, int*,        \
                                    std::size_t) __asm__(#p "sptri_");            \
  extern "C" void koeru_##p##sptrf_(const char*, int*, T*, int*, int*,            \
                                    std::size_t) __asm__(#p "sptrf_");            \
  inline void p##tptri_(char* u, char* d, int* n, T* a, int* r) {                 \
    koeru_##p##tptri_(u, d, n, a, r, 1, 1);                                       \
  }                                                                               \
  inline void p##gesvd_(char* v, char* u, int* m, int* n, T* a, int* lda, T* s,   \
                        T* vt, int* ldvt, T* uu, int* ldu, T* w, int* lw, int* r) { \
    koeru_##p##gesvd_(v, u, m, n, a, lda, s, vt, ldvt, uu, ldu, w, lw, r, 1, 1);  \
  }                                                                               \
  inline void p##sptri_(char* u, int* n, T* a, int* ip, T* w, int* r) {           \
    koeru_##p##sptri_(u, n, a, ip, w, r, 1);                                      \
  }                                                                               \
  inline void p##sptrf_(char* u, int* n, T* a, int* ip, int* r) {                 \
    koeru_##p##sptrf_(u, n, a, ip, r, 1);                                         \
  }

KOERU_LAPACK(float, s)
KOERU_LAPACK(double, d)
#undef KOERU_LAPACK
